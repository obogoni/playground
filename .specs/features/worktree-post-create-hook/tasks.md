# Worktree Post-Create Hook — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill
is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy
review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/worktree-post-create-hook/design.md`
**Status**: Approved
**Branch**: `feature/worktree-post-create-hook`
**Baseline**: 489 tests / 36 files (green on `main`, verified)

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec. Guidelines found:
> `.specs/codebase/TESTING.md` (authoritative — coverage matrix + gate table),
> `.specs/codebase/CONVENTIONS.md`, `vitest.config.ts`
> (`include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']`).

| Code Layer                                                            | Required Test Type | Coverage Expectation                                                 | Location Pattern              | Run Command |
| --------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------- | ----------------------------- | ----------- |
| Main-process deep modules with logic (`repo-config`, `post-create-hook`) | **unit**           | All branches; 1:1 to spec ACs; every listed edge case has a test      | `src/main/<module>.test.ts`   | `npm test`  |
| Shared types (`src/shared/worktrees.ts`)                              | none               | — (typecheck gate only; additive optional field)                       | —                             | build gate  |
| Thin OS/Electron shells (`index.ts` spawn seam + IPC/ctxDeps wiring)   | none               | — (hand-verified per TESTING.md; only extracted logic is unit-tested)  | `src/main/index.ts`           | build gate  |
| Renderer React components (`HookFailureNotice`, both dialogs)          | none               | — (CDP smoke + visual pass, by convention)                             | `src/renderer/**`             | build gate  |

**Provenance note:** `TESTING.md` explicitly excludes renderer components and thin
OS/Electron shells from unit tests ("extract pure/decision logic into a testable seam,
unit-test that seam, and hand-verify the thin OS/Electron shell around it"). This feature
follows that split exactly — which is *why* the design chose the decorator wrapper: it moves
the hook's decision logic out of the un-unit-testable spawn shell and into a seam driven by
hand-rolled fakes. No mocking library (`vi.mock` is used nowhere in this repo).

## Parallelism Assessment

> Generated from codebase.

| Test Type            | Parallel-Safe? | Isolation Model                                                        | Evidence                                          |
| -------------------- | -------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Unit (real-temp-dir) | **Yes**        | Per-test `mkdtempSync(join(tmpdir(),'wtm-…'))` + `rmSync` teardown       | `workspace-config.test.ts`, `config-store.test.ts` |
| Unit (injected fake) | **Yes**        | Hand-rolled fakes constructed per test; no globals, no `vi.mock`         | `task-board.test.ts` (`stubSource`)               |
| Renderer / shells    | n/a            | No unit tests by convention                                             | `TESTING.md` "deliberately NOT unit-tested"       |

## Gate Check Commands

> Generated from codebase (`package.json` scripts + `TESTING.md` gate table).

| Gate Level | When to Use                                       | Command                                        |
| ---------- | ------------------------------------------------- | ---------------------------------------------- |
| Quick      | After tasks with unit tests only                  | `npm test`                                     |
| Full       | After a logic-bearing task / before PR            | `npm run typecheck && npm run lint && npm test` |
| Build      | After phase completion or no-test (wiring/UI) tasks | `npm run build` (= `typecheck` + `electron-vite build`) |

**Build-gate note:** `TESTING.md` lists `npm run build:win` for the Build level. That
heavier gate exists for the packaged-asset pitfalls recorded in the esbuild lesson
(asar paths, unpacked binaries). This feature adds **no packaged asset and no new
dependency** — it spawns a shell already available at runtime — so `npm run build` is the
appropriate build gate. A single `build:win` is still run once at the end of Phase 3 to
confirm the renderer additions package cleanly.

---

## Execution Plan

**3 phases → executed inline** (the sub-agent offer threshold is >3 phases). The always-on
Verifier still runs as a fresh sub-agent after T6.

### Phase 1: Main-process logic (Sequential)

```
T1 → T2 → T3
```

### Phase 2: Wiring (Sequential)

```
T3 → T4
```

### Phase 3: Renderer (Sequential)

```
T4 → T5 → T6
```

---

## Task Breakdown

### T1: Repo-local config reader

**What**: `repoPostCreateCommand(repoPath)` returning the trimmed `postCreateCommand` string
from `<repoPath>\.app\config.json`, or `null`.
**Where**: `src/main/repo-config.ts` (new), `src/main/repo-config.test.ts` (new)
**Depends on**: None
**Reuses**: `src/main/workspace-config.ts` — same read-on-use / `stringOrNull` /
`console.error`-on-malformed shape; `src/main/workspace-config.test.ts` — same temp-dir test
harness.
**Requirement**: WPC-06 (config half), WPC-07, WPC-21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A valid file with `postCreateCommand: "SetupSkills.cmd"` returns `'SetupSkills.cmd'`
- [ ] Surrounding whitespace is trimmed (`"  SetupSkills.cmd  "` → `'SetupSkills.cmd'`)
- [ ] Missing file, missing key, blank/whitespace-only value, and non-string values (number,
      object) each return `null` (WPC-06)
- [ ] Malformed JSON returns `null` **and** logs via `console.error` (WPC-07)
- [ ] A file carrying `branchTemplate`/`worktreeTemplate` alongside `postCreateCommand`
      returns the command and ignores the template keys (WPC-21)
- [ ] Quick gate passes: `npm test`
- [ ] Test count: 489 → **498** (+9), zero deletions

**Tests**: unit · **Gate**: quick
**Commit**: `feat(worktree): read repo-local postCreateCommand from .app/config.json`

---

### T2: Hook runner — result mapping

**What**: `PostCreateHookResult` in shared + `runPostCreateHook()` mapping a `HookShell`
outcome to that result (env injection, output tail, code/timeout classification).
**Where**: `src/shared/worktrees.ts` (modify), `src/main/post-create-hook.ts` (new),
`src/main/post-create-hook.test.ts` (new)
**Depends on**: T1 (none in code; ordered for a clean commit sequence)
**Reuses**: `ShellResult` shape from `workflow-ctx.ts`; `runShell` capture semantics
(`index.ts:70`) as the port contract.
**Requirement**: WPC-02, WPC-03 (payload half), WPC-04, WPC-05 (mapping half), WPC-09,
WPC-11, WPC-20, WPC-23, WPC-24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Type is co-located in `src/shared/worktrees.ts` with `hook?: PostCreateHookResult` added
      to `CreateWorktreeResult`; `npm run typecheck` clean
- [ ] Exit 0 → `{ok:true, code:0, command, output}` (WPC-02)
- [ ] Exit N≠0 → `{ok:false, code:N, command, output}` (WPC-03 payload)
- [ ] Shell reports `code:-1` spawn error → `{ok:false, code:-1}` with the error text present
      in `output` (WPC-04)
- [ ] Shell reports `timedOut:true` → `{ok:false, code:-1, timedOut:true}` (WPC-05 mapping)
- [ ] The shell receives `cwd` = worktree path and an env containing
      `PLAYGROUND_WORKTREE_PATH`, `PLAYGROUND_REPO_PATH`, `PLAYGROUND_BRANCH` **with the
      correct values**, plus inherited `process.env` entries (WPC-09)
- [ ] The shell receives `timeoutMs: 120000` (WPC-05 constant)
- [ ] Combined output longer than 4000 chars keeps the **last** 4000 (WPC-11); stdout and
      stderr are both represented
- [ ] No output at all → `output === ''`, never `undefined` (WPC-23)
- [ ] A worktree path containing spaces reaches the shell as `cwd` unmodified and is never
      interpolated into the command string (WPC-20)
- [ ] Exit 0 with a no-op command still reports `ok:true` (WPC-24)
- [ ] Quick gate passes: `npm test`
- [ ] Test count: 498 → **510** (+12), zero deletions

**Tests**: unit · **Gate**: quick
**Commit**: `feat(worktree): add post-create hook runner with env, output tail and timeout mapping`

---

### T3: Run-iff-created decorator

**What**: `withPostCreateHook(create, deps)` — wraps a `createWorktree`-shaped function,
running the hook only when a worktree was actually produced and attaching `hook` to the result.
**Where**: `src/main/post-create-hook.ts` (modify), `src/main/post-create-hook.test.ts` (modify)
**Depends on**: T1, T2
**Reuses**: T1's reader + T2's runner, both injected as `deps` (project DI-with-hand-rolled-fakes
convention, `task-board.test.ts`).
**Requirement**: WPC-01, WPC-03 (no-rollback half), WPC-06 (no-hook-key half), WPC-08, WPC-22

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Signature is identical to `createWorktree`'s (drop-in for both consumers); typecheck clean
- [ ] `ok:true` + `path` + a configured command → hook runs with `cwd` = the returned path, and
      the result is `{...inner, hook}` (WPC-01)
- [ ] Hook failure leaves `ok:true` and `path` intact, and the wrapper issues **no** remove call
      (WPC-03 — asserted via a fake that would record one)
- [ ] `conflict:'branch-exists'` → runner never invoked, result has **no** `hook` property
      (`'hook' in result === false`) (WPC-08)
- [ ] `ok:false` with an `error` (empty template / target exists / refresh blocked / git failure)
      → runner never invoked, no `hook` property (WPC-08)
- [ ] `ok:true` reached through `onExisting:'reuse'` and through `onExisting:'recreate'` → hook
      **does** run (WPC-08 second half)
- [ ] No configured command → runner never invoked, no `hook` property (WPC-06)
- [ ] Two concurrent wrapped creates each run their hook with their own cwd; neither's output
      leaks into the other (WPC-22)
- [ ] Quick gate passes: `npm test`
- [ ] Test count: 510 → **520** (+10), zero deletions

**Tests**: unit · **Gate**: quick
**Commit**: `feat(worktree): run the post-create hook only when a worktree was created`

---

### T4: Wire the real spawn seam and both consumers

**What**: `runHookShell` (real `spawn` with `shell:true` + native `timeout` + kill detection)
and the single `withPostCreateHook(createWorktree, …)` wiring assigned to **both** the
`worktrees:create` IPC handler and `ctxDeps.worktree.create`.
**Where**: `src/main/index.ts` (modify)
**Depends on**: T3
**Reuses**: `runShell` (`index.ts:70`) as the spawn/capture template.
**Requirement**: WPC-10, WPC-05 (kill half)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `runHookShell` spawns through a shell (`.cmd` support), captures combined stdout/stderr,
      never throws, and maps a `timeout`-triggered kill to `timedOut:true`
- [ ] **One** wrapper instance is assigned to both the IPC handler and `ctxDeps.worktree.create`
      — no caller can opt out (WPC-10); `worktree-manager.ts` and `workflow-ctx.ts` remain
      unmodified (verified by `git diff --stat`)
- [ ] Build gate passes: `npm run build`
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test` — test count still
      **520**, zero deletions

**Tests**: none (thin OS/Electron shell — hand-verified per TESTING.md) · **Gate**: build
**Commit**: `feat(worktree): wire the post-create hook into both create paths`

---

### T5: Hook failure notice component

**What**: One presentational `HookFailureNotice` rendering the created path, the command, the
exit code (or timeout label), and the output tail, plus its stylesheet.
**Where**: `src/renderer/src/components/HookFailureNotice.tsx` (new), `HookFailureNotice.css` (new)
**Depends on**: T4
**Reuses**: `BranchExistsChoice.tsx` — the established in-dialog footer-region resolver pattern
(props-only, `busy` flag, no data fetching); existing CSS tokens.
**Requirement**: WPC-12/WPC-13 (presentation half), WPC-14 (action)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Renders all four required elements: created-worktree path, executed command, exit code
      (or an explicit timeout label when `timedOut`), and the `output` tail
- [ ] Empty `output` renders without an empty bordered block
- [ ] Exposes a single proceed action via props; no IPC calls of its own
- [ ] Build gate passes: `npm run build`

**Tests**: none (renderer — CDP smoke + visual, by convention) · **Gate**: build
**Commit**: `feat(worktree): add hook failure notice component`

---

### T6: Surface hook failure in both dialogs

**What**: Both create dialogs hold a `hookFailure` state, render `HookFailureNotice` on
`hook.ok === false`, and keep today's behavior otherwise.
**Where**: `src/renderer/src/components/NewWorktreeDialog.tsx` (modify),
`src/renderer/src/components/StartWorkDialog.tsx` (modify)
**Depends on**: T4, T5
**Reuses**: each dialog's existing `error`/`conflict`/`busy` state machine and footer region.
**Requirement**: WPC-12, WPC-13, WPC-14, WPC-15, WPC-16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `hook.ok === false` → dialog stays open showing the notice (WPC-12 New Worktree,
      WPC-13 Start Work)
- [ ] The notice's action runs the same post-create flow as the happy path (tree refresh +
      select the new worktree) (WPC-14)
- [ ] `hook.ok === true` or absent `hook` → behavior byte-identical to today (WPC-15)
- [ ] While the notice is shown the create button cannot re-submit (WPC-16)
- [ ] Full gate passes: `npm run typecheck && npm run lint && npm test` — test count still
      **520**, zero deletions
- [ ] `npm run build:win` completes (end-of-phase packaging confirmation)

**Tests**: none (renderer — CDP smoke + visual, by convention) · **Gate**: build
**Commit**: `feat(worktree): surface post-create hook failures in the create dialogs`

---

## Task Granularity Check

| Task                            | Scope                                        | Status      |
| ------------------------------- | -------------------------------------------- | ----------- |
| T1: repo config reader          | 1 function + its tests                       | ✅ Granular |
| T2: hook runner mapping         | 1 function + 1 shared type                   | ✅ Granular |
| T3: run-iff-created decorator   | 1 function (same cohesive module as T2)      | ✅ Granular |
| T4: spawn seam + wiring         | 1 seam + 1 wiring point, one file            | ✅ Granular |
| T5: notice component            | 1 component + its CSS                        | ✅ Granular |
| T6: dialog integration          | 2 files, one identical cohesive change each  | ⚠️ OK — cohesive; splitting would leave the shared notice half-wired |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status   |
| ---- | ---------------------- | ------------- | -------- |
| T1   | None                   | (phase start) | ✅ Match |
| T2   | T1                     | T1 → T2       | ✅ Match |
| T3   | T1, T2                 | T2 → T3 (T1 transitively via T2) | ✅ Match |
| T4   | T3                     | T3 → T4       | ✅ Match |
| T5   | T4                     | T4 → T5       | ✅ Match |
| T6   | T4, T5                 | T5 → T6 (T4 transitively via T5) | ✅ Match |

No task carries `[P]` — every phase is sequential, so no parallel-safety conflict is possible.

## Test Co-location Validation

| Task | Code Layer Created/Modified                      | Matrix Requires | Task Says | Status |
| ---- | ------------------------------------------------ | --------------- | --------- | ------ |
| T1   | Main-process deep module (`repo-config`)          | unit            | unit      | ✅ OK  |
| T2   | Main-process deep module (`post-create-hook`) + shared type | unit (highest) | unit | ✅ OK  |
| T3   | Main-process deep module (`post-create-hook`)     | unit            | unit      | ✅ OK  |
| T4   | Thin OS/Electron shell (`index.ts` spawn + wiring) | none            | none      | ✅ OK  |
| T5   | Renderer component                                | none            | none      | ✅ OK  |
| T6   | Renderer components                               | none            | none      | ✅ OK  |

**No deferral:** every task that creates unit-testable logic writes its own tests in the same
commit. T4–T6 are `Tests: none` because the matrix says `none` for those layers (thin shell /
renderer), not because their tests were pushed elsewhere.

---

## Requirement → Task Map

| Requirement            | Task     |
| ---------------------- | -------- |
| WPC-01                 | T3       |
| WPC-02                 | T2       |
| WPC-03                 | T2 + T3  |
| WPC-04                 | T2       |
| WPC-05                 | T2 (mapping) + T4 (kill) |
| WPC-06                 | T1 + T3  |
| WPC-07                 | T1       |
| WPC-08                 | T3       |
| WPC-09                 | T2       |
| WPC-10                 | T4       |
| WPC-11                 | T2       |
| WPC-12, WPC-13         | T5 + T6  |
| WPC-14, WPC-15, WPC-16 | T6       |
| WPC-17..19 (P2)        | — deferred, out of this slice |
| WPC-20, WPC-23, WPC-24 | T2       |
| WPC-21                 | T1       |
| WPC-22                 | T3       |

**Coverage:** 21 of 21 P1 requirements mapped to a task. 0 unmapped.
