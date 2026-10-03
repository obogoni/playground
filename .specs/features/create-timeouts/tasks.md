# Create Timeouts Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/create-timeouts/design.md`
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01)

**Branch**: `feature/create-timeouts`, cut from `origin/main` `60ff148`. Issue #153 runs after #145 (`feature/branch-slug-short`), which edits `git.ts`, `createWorktree`'s guards, both create dialogs, `worktree-manager.test.ts` and `smoke-start-work.mjs`. **Before T1**, once #145 has merged: `git fetch origin && git rebase origin/main`, then re-read the line numbers this plan cites. The PR body carries `Closes #153`.

**Reconciled at Execute (2026-10-03)**: #145 had not merged (PR #161 open), so the branch is **stacked on `feature/branch-slug-short` `a2d6e1d`** (itself on `origin/main` `6d96ae4`); the PR says "depends on #161" and is rebased onto `origin/main` once #161 merges. **Update:** #161 merged during Execute, and after T16 the branch was rebased onto `origin/main` `fc19a3c` (#162 included). `git.ts` keeps #162's diagnostics (`.finally(end)`) with stdin ended in the same callback; #162's PDIAG-15 timeout test used `hash-object --stdin` as its blocker and moved to the sleeping alias, assertions unchanged (`baa658b`); the PR needs no "depends on". Against the stacked base:
- **Spawn pacer (PERF-22, #154).** `git()` now returns `pace(() => run(...))`, so the promise it returns has no `child`. T2 ends stdin inside the pacer's start callback: `const p = run(...); p.child.stdin?.end(); return p`. The pacer runs at most 4 git processes at once, so a hung fetch or checkout holds one slot until its timeout (before this feature, forever).
- **The create's seventh parameter is taken.** #145 added `deps?: PathCheckDeps` as `createWorktree`'s seventh parameter, used only by its path-check tests. Owner decision: it moves into the factory. `CreateWorktreeDeps` gains `pathCheck?: PathCheckDeps` (absent = the real platform and `git`), `createWorktreeWith(deps)` passes it to `checkCreatePaths`, and `createWorktree`'s seventh parameter becomes `onStep` as designed. The `createWorktree — path check (BSLG-25..39)` tests change their call shape only, from `createWorktree(…, win32)` to `createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(…)`; no assertion changes. This lands in T4.
- **`smoke-start-work.mjs` already honours `SMOKE_CONFIG`** (#145, with a `--seed` / `--clean` mode); T15 reuses it instead of adding it.
- **Line numbers moved**: the WBR clone setup is the `createWorktree — base refresh (WBR)` block (`worktree-manager.test.ts:862`); the `isTimeout` blocker is `git.test.ts:87-92`; the create handler is `index.ts:400-403`; `emitToWindow` is defined at `index.ts:493`; the forward-verbatim test is `post-create-hook.test.ts:292`.
- **AD number**: `main` and the open PRs hold up to AD-057 (#162); T16 checks again before writing.

**Baseline (2026-10-03, on `a2d6e1d` + the plan commits)**: `npx vitest run` 121 files, 2622 tests passed; `npm run typecheck` exit 0; `npm run lint` 0 errors, 18 warnings. Five slowest test files of a full run (T1, re-measured on the same base: 121 files, 2622 passed): `worktree-manager.test.ts` 128.6 s, `git-sync.test.ts` 91.6 s, `commit-log.test.ts` 46.9 s, `file-discard.test.ts` 35.6 s, `file-diff.test.ts` 28.3 s (file wall time under the parallel run).

**Setup (before T1, no commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` and `node node_modules/electron/install.js`, then record the **test baseline** here: `npx vitest run` count, `npm run typecheck`, `npm run lint` errors and warnings, and the five slowest test files of a full run (L-005).

**Stop rule (T1)**: T1 must show today's code blocked on a fetch that waits for input. If git cannot be made to block that way on Windows, stop after T1 and report to the owner before any timeout or dialog work.

**Owner-confirmed rows** (spec Assumptions, `owner confirmed 2026-10-01`): timeout values (60 s for fetch and fast-forward, 10 min for the checkout, the hook keeps 120 s), timeout texts, step labels and placement, closing while busy (the dialog stays open: a backdrop click does nothing and Cancel is disabled with its tooltip), the partial worktree after a checkout timeout, all as the plan proposed them.

**Hand-verify** (not automatable, listed in the smoke headers): a real credential manager window during a fetch (the create ends at 60 s; the window may stay open); the progress line during a slow checkout of a large repository; the spinner stopped under reduced motion.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts` (30 s test and hook timeouts), `package.json` scripts, the `worktree-base-refresh` and `hours-task-assign` plans, confirmed lessons L-001, L-005, L-009.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main runners (`git.ts`, `hook-shell.ts`) | unit (real process) | CRTO-06..08 against a real `git` and a real `cmd.exe`; every existing test kept with its assertion | `src/main/<module>.test.ts` | `npx vitest run src/main/<module>.test.ts` |
| Main create path (`worktree-manager.ts`) | unit (real git + injected runner) | 1:1 to CRTO-01..04, 09, 10, 12, 14, 15; every bounded call, every path (new branch, existing branch, reuse, recreate); a runner that never settles on its own; limits pinned by literal (L-009) | `src/main/worktree-manager.test.ts` | `npx vitest run src/main/worktree-manager.test.ts` |
| Main decorator (`post-create-hook.ts`) | unit (fakes) | CRTO-11, 13, 15: forwarding and the hook step, both sides of each condition | `src/main/post-create-hook.test.ts` | `npx vitest run src/main/post-create-hook.test.ts` |
| Test fixture (`waiting-remote.fixture.ts`) | unit (real git) | Proves the fixture blocks a fetch until killed | `src/main/waiting-remote.fixture.test.ts` | `npx vitest run src/main/waiting-remote.fixture.test.ts` |
| Renderer pure lib (`create-progress.ts`) | unit | 1:1 to CRTO-16, 17, 20 literals; both sides of the request-id match | `src/renderer/src/lib/create-progress.test.ts` | `npx vitest run src/renderer/src/lib/create-progress.test.ts` |
| IPC contract and `index.ts` wiring | none (thin shell) | Typecheck; exercised end to end by the smoke | — | `npm run typecheck` |
| Renderer hook (`use-create-progress.ts`) | none (thin shell) | Typecheck; smoke | — | `npm run typecheck` |
| Dialog components and CSS | none (CDP smoke) | CRTO-05, 16, 19, 20 in the running app | — | `node scripts/smoke-create.mjs`, `node scripts/smoke-start-work.mjs` |
| Docs (`STATE.md`, sibling specs) | none | — | — | review |
| End to end | manual CDP smoke | Every new check first seen failing on a deliberately broken build | `scripts/smoke-create.mjs`, `scripts/smoke-start-work.mjs` | dev app on a throwaway `--user-data-dir` (T14, T15) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run <the task's test file>` then `npm test` |
| Full | After a code task with no tests of its own | `npm run typecheck && npm run lint && npm test` |
| Build | CSS and dialog tasks | `npm run typecheck && npm run lint && npx electron-vite build` |
| Manual | Smoke tasks T14, T15 | Seed: `SMOKE_CONFIG=<dir>\config.json node scripts/seed-smoke-remove.mjs <base>`; launch: `npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; run the smoke script |

**Lint is judged by exit code AND by warning count** — diff it against the setup baseline at every gate.

**Smoke falsification rules** (T14, T15): each new check is first seen FAILING on a deliberately broken build. The mutant is applied by a script that keeps an `.orig` copy, asserts the mutant applied (the edited text is present and the original is gone), and restores the file in `finally`; `git status --porcelain` is checked clean afterwards. `npm run dev` does not restart the main process on `src/main` edits: a mutant under `src/main` needs the dev app relaunched. The dev app always runs on a throwaway `--user-data-dir` with the three anti-throttling flags above.

---

## Execution Plan

Phases are ordered and run sequentially; tasks within a phase run in order.

### Phase 1: Prove the hang

```
T1
```

### Phase 2: Nothing waits on input

```
T1 → T2 → T3
```

### Phase 3: Bounded create

```
T3 → T4 → T5 → T6
```

### Phase 4: Steps in main

```
T6 → T7 → T8 → T9
```

### Phase 5: Dialogs

```
T9 → T10 → T11 → T12 → T13
```

### Phase 6: Prove and record

```
T13 → T14 → T15 → T16
```

---

## Task Breakdown

### T1: Reproduce a fetch that waits for a credential answer

**What**: A test fixture that makes a base fetch wait on input, and the evidence that today's create hangs on it.
- `startWaitingRemote(): Promise<{ url: string; close(): Promise<void> }>`: an in-process HTTP server on `127.0.0.1`, port 0, answering every request `401` with `WWW-Authenticate: Basic realm="fixture"`.
- `trackWaitingRemote(repo, url)`: in a repo on `main`, adds `origin` at `url`, sets `branch.main.remote` / `branch.main.merge`, writes `refs/remotes/origin/main` at `HEAD` (without it `main@{upstream}` does not resolve, measured), resets the credential helper list (`credential.helper` = empty) and adds a helper that leaves the repo folder and waits: `!cd / && sleep 30`.
- Fixture test: `git(repo, ['fetch', 'origin', 'main'], { timeoutMs: 3000 })` rejects with `isTimeout(err) === true` after at least 3000 ms, i.e. git was still waiting when the kill came.
- Evidence, not committed: a throwaway test file runs today's `createWorktree(repo, 'feature/hang', 'main', undefined, true)` against the fixture and records that it is still pending after 10 s. The file is deleted before the commit; the output goes in the Notes below.

**Where**: `src/main/waiting-remote.fixture.ts` (test in `src/main/waiting-remote.fixture.test.ts`)
**Depends on**: None
**Reuses**: `*.fixture.ts` convention (`activity-sequences.fixture.ts`), the WBR clone setup (`worktree-manager.test.ts:621-665`), the planning probe (spec Problem Statement)
**Requirement**: CRTO-02 (evidence)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Setup step done and the baseline recorded at the top of this file
- [x] Fixture test passes, and fails when the helper is replaced by one that answers at once (seen once, not committed)
- [x] The throwaway create run shows the promise still pending at 10 s; output pasted under Notes
- [x] `afterEach` cleanup succeeds on Windows (no `EPERM` from a held folder)
- [x] **Stop rule applied**: if the fetch does not block until the kill, stop here and report to the owner
- [x] Gate check passes: `npx vitest run src/main/waiting-remote.fixture.test.ts` then `npm test`
- [x] Test count: baseline + 1

**Notes** (2026-10-03, git 2.55.0.windows.4, Node 24.19.0):
- Throwaway run of today's `createWorktree(repo, 'feature/hang', 'main', undefined, true)` against the fixture: `after 10011 ms: still pending`. After `close()` released the helper: `settled at 10025 ms with {"ok":false,"error":"fatal: could not read Username for 'http://127.0.0.1:57490': terminal prompts disabled"}; worktree folder exists: false`. Stop rule: the fetch blocks until killed, so T2 proceeds.
- Fixture test: passes at 3.0 s with `isTimeout === true`. With the helper replaced by `echo username=x; echo password=y` it fails: `expected false to be true` (git fails at once on the second 401).
- **Deviation from the planned helper.** `!cd / && sleep 30` does not wait: git appends the operation, so the shell runs `sleep 30 get`, which fails at once (`sleep: invalid time interval 'get'`, measured). The helper is a shell function, `!f() { cd / && curl -s --max-time 30 <remote>/wait; }; f`, so `get` becomes its argument.
- **Deviation from the planned cleanup.** `cd /` is not enough on Windows: after git is killed, `git remote-http` and `git-remote-http.exe` (cwd in the repo) wait on the helper, and `rmSync` fails with `EPERM` (measured, still at 5 s). The helper therefore waits on a `/wait` request the fixture's server holds open until `close()`; once released, the orphans exit within about 60 ms. `removeReleasedFolder` retries `EPERM`/`EBUSY` for up to 5 s after `close()`, because `rmSync`'s own `maxRetries` did not retry this `EPERM` (measured). Tests that use the fixture call `close()` and then `removeReleasedFolder` in `afterEach`.
- Full run after T1: 122 files, 2623 passed; lint 0 errors, 18 warnings; typecheck exit 0. Five slowest files: `worktree-manager.test.ts` 105.6 s, `git-sync.test.ts` 81.8 s, `commit-log.test.ts` 49.5 s, `file-discard.test.ts` 36.2 s, `file-diff.test.ts` 29.4 s.

**Tests**: unit
**Gate**: quick

**Commit**: `test(worktrees): reproduce a base fetch that waits for a credential answer`

---

### T2: Git gets an ended stdin

**What**: `git()` ends `child.stdin` on the promisified call before returning it; `GitRunner` gains the optional `opts` argument; the doc comment lists "stdin ended" among the runner's guarantees. The `isTimeout` test's blocker moves from `hash-object --stdin` to a sleeping alias (`-c alias.wait=!sleep 5 wait`, `timeoutMs: 200`), its assertion unchanged.
**Where**: `src/main/git.ts`
**Depends on**: T1
**Reuses**: `git()` (`git.ts:15-35`); the alias technique of `git.test.ts:59-68`
**Requirement**: CRTO-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `git(tmpdir(), ['hash-object', '--stdin'])` resolves with stdout `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` and no `timeoutMs` given; the `isTimeout` test still asserts `true` with its new blocker; the existing `GIT_TERMINAL_PROMPT` and literal-argument tests pass unchanged
- [x] The new stdin test fails on the pre-T2 `git.ts` (seen once: `Test timed out in 30000ms`)
- [x] Gate check passes: `npx vitest run src/main/git.test.ts` then `npm test` (122 files, 2624 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T1 count + 1

**Tests**: unit
**Gate**: quick

**Commit**: `fix(git): give every git process an ended stdin`

---

### T3: The post-create command runs with stdin ignored

**What**: `runHookShell` spawns with `stdio: ['ignore', 'pipe', 'pipe']`.
**Where**: `src/main/hook-shell.ts`
**Depends on**: T2
**Reuses**: the real-process tests in `hook-shell.test.ts`; the planning probe (both commands below settled in about 90 ms with stdin ignored and were killed at 4 s without)
**Requirement**: CRTO-07, CRTO-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, with `timeoutMs: 30000`: `set /p answer=Continue? & echo after-prompt` settles in under 5000 ms with `code` 0, no `timedOut`, stdout containing `after-prompt`; `pause & echo after-pause` the same with `after-pause` (asserted on that word, not on `pause`'s localized prompt); `set /p answer=x & exit /b 3` reports `code` 3 and no `timedOut`
- [x] Each new test fails on the pre-T3 `hook-shell.ts` (seen once: all three `Test timed out in 30000ms`)
- [x] Gate check passes: `npx vitest run src/main/hook-shell.test.ts` then `npm test` (122 files, 2627 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T2 count + 3

**Tests**: unit
**Gate**: quick

**Commit**: `fix(worktrees): run the post-create command with stdin ignored`

---

### T4: The create takes its runner and its limits

**What**: `REFRESH_TIMEOUT_MS`, `CHECKOUT_TIMEOUT_MS`, `CreateWorktreeDeps`, `createWorktreeWith(deps)` and `createWorktree` as its real instance, per design.md. The create path's helpers take a context with `deps` and call `deps.run`; the fetch and the fast-forward pass `{ timeoutMs: deps.refreshTimeoutMs }`, every `git worktree add` passes `{ timeoutMs: deps.checkoutTimeoutMs }`. The real deps are exported as `REAL_CREATE_DEPS`. No message changes yet.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T3
**Reuses**: `refreshBaseFromRemote`, `addWorktree`, `resolveExistingBranch` (`worktree-manager.ts:110-233`)
**Requirement**: CRTO-01, CRTO-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, with a recording runner that delegates to the real `git` and logs `(args, opts)`: on a refresh with the base checked out, `fetch origin main` and `merge --ff-only origin/main` carry `timeoutMs: 60000`; with the base not checked out, `fetch origin main:main` carries `60000` (tested as `fetch origin release:release`, the WBR shape of an unchecked base); `worktree add` carries `600000` on the new-branch, existing-branch (empty base), reuse and recreate paths; `rev-parse`, `worktree list` and `branch -D` carry no `timeoutMs`
- [x] Tests pin the constants by literal: `REFRESH_TIMEOUT_MS === 60000`, `CHECKOUT_TIMEOUT_MS === 600000`, and `REAL_CREATE_DEPS` holds `git` and both constants (L-009)
- [x] Every existing `createWorktree` test passes unchanged (the path-check block changed its call shape only, to `createWorktreeWith({ ...REAL_CREATE_DEPS, pathCheck: win32 })(…)`)
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test` (122 files, 2633 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T3 count + the new tests (+6)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): bound the base refresh and the checkout by a timeout`

---

### T5: A timed-out refresh says so

**What**: In `refreshBaseFromRemote`, `isTimeout` is checked before the existing failure lines: fetch → `fetchTimeoutText(upstream, ms)`, fast-forward → `fastForwardTimeoutText(base, upstream, ms)`; `limitText(ms)` per design.md.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T4
**Reuses**: `ffFailureLine`'s shape (`worktree-manager.ts:246-253`); T1's fixture
**Requirement**: CRTO-02, CRTO-03, CRTO-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, runner that never settles on its own (the matched call rejects with `killed: true` only when its `timeoutMs` elapses; other calls go to the real `git`, unbounded), limits of 20 ms: a hung fetch ends the create with `ok: false`, the fetch text, no target folder and no new branch; a hung `merge --ff-only` and a hung `fetch origin main:main` (tested as `fetch origin release:release`) each end it with the fast-forward text; a hung fetch on the recreate path leaves the existing branch at its previous tip
- [x] Tests with the real limits and a runner whose matched call rejects at once with `killed: true`: the exact texts `Fetching origin/main timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.` and `Fast-forwarding "main" to origin/main timed out after 60 s. Retry, or uncheck "Update base branch from remote" to skip.`
- [x] Test over real git with T1's fixture and `refreshTimeoutMs: 2000`: the create returns `Fetching origin/main timed out after 2 s. …` and creates no worktree
- [x] Test: a fetch that fails without a kill (unreachable remote) still returns git's own line (WBR-02 unchanged)
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test` (122 files, 2641 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T4 count + the new tests (+8)

**Notes**: `limitText` deviates from design.md (`SPEC_DEVIATION` marker in `worktree-manager.ts`): the design's rule (minutes for any whole number of minutes) prints `1 min` for 60000 ms, against the spec's `60 s`. Minutes start past one minute, so `60 s` and `10 min` both hold; 20 ms reads `0.02 s` and 2000 ms `2 s`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): report a base refresh that timed out`

---

### T6: A timed-out checkout says so

**What**: In `addWorktree`, `isTimeout` → `checkoutTimeoutText(target, ms)`; otherwise `gitFailureLine` as today.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T5
**Reuses**: `addWorktree` (`worktree-manager.ts:163-174`), T5's never-settling runner
**Requirement**: CRTO-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, never-settling `worktree add` with a 20 ms limit: the create ends `ok: false` on the new-branch, existing-branch, reuse and recreate paths (each with the exact checkout text at `0.02 s` and its target)
- [x] Test with the real limit and an at-once `killed: true`: the exact text `Creating the worktree timed out after 10 min and git was stopped. Part of it may remain at {target}; remove it before retrying.` with the real target path
- [x] Test: `withPostCreateHook` over a create whose `worktree add` timed out does not call its shell
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test` (122 files, 2647 passed; lint 0 errors, 18 warnings; typecheck exit 0; `electron-vite build` exit 0 at the end of Phase 3)
- [x] Test count: T5 count + the new tests (+6)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): report a checkout that timed out`

---

### T7: The create reports its steps

**What**: `CreateStep` in `src/shared/worktrees.ts`; the create's seventh parameter `onStep`; `refreshing-base` on entry to `refreshBaseFromRemote`, `creating-worktree` on entry to `addWorktree`.
**Where**: `src/main/worktree-manager.ts` (type in `src/shared/worktrees.ts`)
**Depends on**: T6
**Reuses**: the T4 context argument
**Requirement**: CRTO-11, CRTO-12, CRTO-14, CRTO-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests over real git, recording the steps in order: refresh on → `['refreshing-base', 'creating-worktree']`; refresh off → `['creating-worktree']`; empty base → `['creating-worktree']`; reuse → `['creating-worktree']`; recreate with refresh → `['refreshing-base', 'creating-worktree']`; refresh failure (no upstream) → `['refreshing-base']`; branch-exists conflict → `[]`; target exists → `[]`; empty template name → `[]` (empty base and reuse run with the refresh ticked, so they show it is skipped)
- [x] Test: a create without `onStep` behaves as before (existing tests pass unchanged)
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test` (122 files, 2656 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T6 count + the new tests (+9; the six that expect a step failed on the pre-T7 code with `expected [] to deeply equal [...]`)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): report each step of a create`

---

### T8: The decorator forwards steps and reports the hook

**What**: `CreateWorktreeFn` gains `onStep`; `withPostCreateHook` forwards seven arguments and calls `onStep?.('running-hook')` right before `runPostCreateHook`.
**Where**: `src/main/post-create-hook.ts`
**Depends on**: T7
**Reuses**: `withPostCreateHook` (`post-create-hook.ts:117-140`), `fakeCreate` in its tests
**Requirement**: CRTO-11, CRTO-13, CRTO-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The forward-verbatim test (`post-create-hook.test.ts:292-306`) passes a step callback and asserts all seven arguments, the callback included
- [x] Tests: a fake create that reports `creating-worktree` and succeeds, with a declared command → `['creating-worktree', 'running-hook']`, and `running-hook` is recorded before the shell is called; no declared command → no `running-hook`; a failed create → no `running-hook`; a branch-exists conflict → no `running-hook`; no `onStep` → the hook still runs
- [x] Gate check passes: `npx vitest run src/main/post-create-hook.test.ts` then `npm test` (122 files, 2661 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T7 count + the new tests (+5; on the pre-T8 decorator the extended forward test and the three tests that expect a step failed)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): report the post-create step`

---

### T9: Push the steps to the window

**What**: `requestId?: string` on the `worktrees:create` request; `IpcEvents['worktrees:create-step']`; the handler builds `onStep` only when `requestId` is set and passes it as the seventh argument.
**Where**: `src/main/index.ts` (contract in `src/shared/ipc-contract.ts`)
**Depends on**: T8
**Reuses**: `emitToWindow` (`index.ts:436-438`), the handler at `index.ts:344-348`
**Requirement**: CRTO-11, CRTO-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The handler passes `undefined` for `onStep` when the request has no `requestId` (read in review: `requestId === undefined ? undefined : (step) => emitToWindow(…)`; exercised by the T14 smoke)
- [x] `workflow-ctx.ts` is unchanged and still typechecks
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (typecheck exit 0; lint 0 errors, 18 warnings; 122 files, 2661 passed)
- [x] Test count: T8 count (no new tests)

**Tests**: none
**Gate**: full

**Commit**: `feat(ipc): push a worktree create's step to the window`

---

### T10: Progress labels, pure

**What**: `STEP_LABELS`, `PREPARING_LABEL`, `progressLabel`, `acceptsStep`, `BUSY_CANCEL_TITLE` per design.md.
**Where**: `src/renderer/src/lib/create-progress.ts`
**Depends on**: T9
**Reuses**: the label-map pattern of `SyncPopover.tsx:31` (`RUNNING_LABEL`)
**Requirement**: CRTO-16, CRTO-17, CRTO-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests by literal (L-009): `progressLabel(null) === 'Preparing…'`, `progressLabel('refreshing-base') === 'Updating base branch from remote…'`, `progressLabel('creating-worktree') === 'Creating worktree…'`, `progressLabel('running-hook') === 'Running post-create command…'`, `BUSY_CANCEL_TITLE === 'Wait for the create to finish'`
- [x] Tests: `acceptsStep('a', { requestId: 'a' })` is true; `acceptsStep('a', { requestId: 'b' })` and `acceptsStep(null, { requestId: 'a' })` are false
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/create-progress.test.ts` then `npm test` (123 files, 2669 passed; lint 0 errors, 18 warnings; typecheck exit 0)
- [x] Test count: T9 count + the new tests (+8; against a stub returning `''` and always `true`, seven failed and the accept test passed, as an always-`true` stub should)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): name each create step for the dialog`

---

### T11: The dialogs' progress hook

**What**: `useCreateProgress()` per design.md: `begin()` returns a new `crypto.randomUUID()` and clears the step; one `api.on('worktrees:create-step')` subscription for the component's life, filtered by `acceptsStep`; `end()` clears both; `label` is null when no request is in flight.
**Where**: `src/renderer/src/lib/use-create-progress.ts`
**Depends on**: T10
**Reuses**: `api.on` and the subscribe-in-effect pattern of `use-git-sync.ts`
**Requirement**: CRTO-16, CRTO-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The subscription is removed on unmount (the effect returns `api.on`'s unsubscribe)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (typecheck exit 0; lint 0 errors, 18 warnings; 123 files, 2669 passed)
- [x] Test count: T10 count (no new tests)

**Tests**: none
**Gate**: full

**Commit**: `feat(worktrees): track a create's step in the renderer`

---

### T12: New worktree dialog shows the step and stays open while busy

**What**: `NewWorktreeDialog` uses `useCreateProgress`: `submit` sends `requestId: begin()`; every settle path calls `end()` (before `onCreated` on success); the `dialog-progress` line with the spinning `loader` icon shows `label` above `dialog-error`; the backdrop does nothing while busy; the footer Cancel is disabled with `BUSY_CANCEL_TITLE` while busy. `.dialog-progress`, its spinner and the reduced-motion rule go in `NewWorktreeDialog.css`, which both dialogs import.
**Where**: `src/renderer/src/components/NewWorktreeDialog.tsx` (styles in `NewWorktreeDialog.css`)
**Depends on**: T11
**Reuses**: `SyncPopover.tsx:157-163` and `SyncPopover.css:87-102` (status line, loader, reduced motion)
**Requirement**: CRTO-05, CRTO-16, CRTO-17, CRTO-19, CRTO-20, CRTO-21

**Tools**:

- MCP: NONE
- Skill: `frontend-design` (spacing and the line's look only)

**Done when**:

- [x] Backdrop while the hook advisory shows still continues the flow (WPC-14), read in review: `busy ? undefined : hookFailure ? () => onCreated(hookFailure.path) : onClose`, and the advisory is set in the same callback that sets `busy` false, so the busy guard never covers it
- [x] Gate check passes: `npm run typecheck && npm run lint && npx electron-vite build` (typecheck exit 0; lint 0 errors, 18 warnings; build exit 0)
- [x] Test count: T11 count (no new tests)

**Notes**: the footer Cancel's disabled look (`.dialog-footer .dialog-btn-ghost:disabled`, opacity 0.5, no hover colour) is scoped to the footer, so `BranchExistsChoice`'s busy Cancel keeps its current look. The spinner reuses the `SyncPopover` rule: 1 s linear rotation, off under `prefers-reduced-motion: reduce`.

**Tests**: none
**Gate**: build

**Commit**: `feat(worktrees): show the create step in the new worktree dialog`

---

### T13: Start Work dialog shows the step and stays open while busy

**What**: The same changes as T12 in `StartWorkDialog`, reusing T12's CSS classes.
**Where**: `src/renderer/src/components/StartWorkDialog.tsx`
**Depends on**: T12
**Reuses**: T12
**Requirement**: CRTO-05, CRTO-16, CRTO-17, CRTO-19, CRTO-20, CRTO-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Backdrop while the hook advisory shows still continues the flow (WPC-14), read in review: the same `busy ? undefined : hookFailure ? … : onClose` guard as T12, and `setHookFailure` runs beside `setBusy(false)`
- [x] Gate check passes: `npm run typecheck && npm run lint && npx electron-vite build` (typecheck exit 0; lint 0 errors, 18 warnings; build exit 0; `npm test` 123 files, 2669 passed)
- [x] Test count: T12 count (no new tests)

**Tests**: none
**Gate**: build

**Commit**: `feat(worktrees): show the create step in the start work dialog`

---

### T14: Smoke: New worktree shows the step and keeps the dialog

**What**: A new section in `smoke-create.mjs`. It writes the seeded workspace's `.app/config.json` with `postCreateCommands: { "api": "ping -n 6 127.0.0.1 > NUL" }` (backing up any file there and restoring it in `finally`), opens the dialog, types `chore/progress`, unticks the base refresh (the seed has no remote), presses Create, and checks:
- 14.1 at about 1500 ms, `.dialog-progress` reads `Running post-create command…`;
- 14.2 Cancel is disabled with the title `Wait for the create to finish`;
- 14.3 a backdrop click leaves `.dialog-panel` in place 300 ms later;
- 14.4 within 15 s the dialog closes and `chore/progress` is the selected worktree, with no `.dialog-progress` left.

It then removes the worktree through `worktrees:remove` and deletes the branch, so the script can rerun. The header gains the hand-verify block (spec: credential window, large checkout, reduced motion) and the throwaway `--user-data-dir` launch line.
**Where**: `scripts/smoke-create.mjs`
**Depends on**: T13
**Reuses**: the script's `evaluate`, `setBranchExpr`, `check` helpers; `seed-smoke-remove.mjs` (`SMOKE_CONFIG`)
**Requirement**: CRTO-05, CRTO-11, CRTO-16, CRTO-19, CRTO-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each new check seen failing on its mutant, then passing: `progressLabel` returning `PREPARING_LABEL` for every step (14.1); the decorator's `onStep?.('running-hook')` removed, dev app relaunched (14.1); Cancel's `disabled={busy}` removed (14.2); the backdrop's busy guard removed (14.3)
- [x] The mutant script keeps `.orig`, asserts the mutant applied, restores in `finally`; `git status --porcelain` clean afterwards
- [x] The section passes twice in a row on the same seed (the cleanup works)
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Notes** (2026-10-03, dev app on a throwaway `--user-data-dir`, CDP port from `SMOKE_PORT`):
- `smoke-create.mjs` now honours `SMOKE_PORT` (default 9222) and `SMOKE_ONLY=progress`. The section waits up to 4 s for the hook label instead of sampling once at 1500 ms; on the real build the line read `Preparing…`, `Creating worktree…`, `Running post-create command…` and reached the hook label at about 560 ms, and the dialog closed at about 6 s.
- `SMOKE_ONLY=progress`: 5/5 twice in a row on the same seed, before and after the mutant runs; the worktree, the branch and the `.app` folder it writes are gone afterwards.
- Mutants, each applied by a script outside the repo that keeps an `.orig` copy, checks the anchor once and restores in `finally` (`git status --porcelain` showed only this task's script afterwards): `progressLabel` always `Preparing…` killed by 14.1 (`seen: ["Preparing…"]`); `onStep?.('running-hook')` removed, app relaunched, killed by 14.1 (`seen` stops at `Creating worktree…`); Cancel's `disabled={busy}` removed killed by 14.2 (`disabled: false`); the backdrop's busy guard removed killed by 14.3 (`open: false`) and 14.4.
- Whole script on a fresh seed and a fresh launch: 12/14. The two CRWT create checks (`create closes dialog and selects the new worktree`, `worktree exists on disk`) fail the same way on the pre-feature build (`dd6cbe7`, its own script): the dialog's base refresh is on by default (WBR) and the seed has no remote, so the create stops on `Base branch "main" has no remote upstream to refresh from.` Not caused by this feature and left as it is.

**Tests**: manual
**Gate**: manual

**Commit**: `test(worktrees): check the create step and the busy dialog in the new worktree smoke`

---

### T15: Smoke: Start Work shows the step and keeps the dialog

**What**: The same four checks in `smoke-start-work.mjs` (the smoke issue #153 names), on the Start Work dialog, with the same workspace `postCreateCommands` set and restored around the section and the refresh unticked. `CONFIG_PATH` honours `SMOKE_CONFIG` when set, so the run can use a throwaway `--user-data-dir`. The work item URL stays in `SMOKE_TASK_URL` and is never written to the repo.
**Where**: `scripts/smoke-start-work.mjs`
**Depends on**: T14
**Reuses**: T14's section and mutant script
**Requirement**: CRTO-11, CRTO-16, CRTO-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each new check seen failing on its mutant, then passing: `progressLabel` mutant (label); the Start Work backdrop's busy guard removed (backdrop); its Cancel's `disabled={busy}` removed (Cancel)
- [x] The mutant script keeps `.orig`, asserts the mutant applied, restores in `finally`; `git status --porcelain` clean afterwards
- [x] The existing Start Work checks still pass
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Notes** (2026-10-03, offline, on the #145 seed: `--seed` with `SMOKE_CONFIG` and `SMOKE_BASE`, no Azure DevOps, no work item URL):
- New section `SMOKE_ONLY=progress`, checks 10-13 (the script's numbering continues after 9), on `bss-default\app` with `postCreateCommands` written to `bss-default\.app\config.json` and the refresh unticked. It runs in the full drive too when the seed is present.
- **Deviation: how Start Work opens.** The card's Start work button stays disabled without live work item details, so the section calls the Tasks pane's own `onStartWork` prop (read from its React fiber) with a placeholder task that is not pinned and has no details (`#4821`, `acme/platform`, empty URL). The dialog that opens is the real `StartWorkDialog` (kicker `Start work`); with no details it asks Azure DevOps nothing (the parent lookup is skipped) and the branch is typed.
- Both sections now refresh the tree and select another worktree before Create, so the last check (14.4, 13) sees the create's own selection: on a first backdrop mutant run, a row left selected by the previous run already read `chore/progress` at 889 ms.
- `SMOKE_ONLY=progress`: 4/4 twice in a row on the same seed; the worktree, the branch and the `.app` folder are gone afterwards. The T14 section, with the new precondition: 5/5 twice in a row.
- Mutants (same script as T14, renderer only, no relaunch): `progressLabel` always `Preparing…` killed by 10 (`seen: ["Preparing…"]`); Cancel's `disabled={busy}` removed killed by 11 (`disabled: false`); the backdrop's busy guard removed killed by 12 (`open: false`) and 13. `git status --porcelain` showed only this task's scripts afterwards.
- Whole script after `--clean`, `--seed` and a fresh launch: 11/11 (checks 1-7 and 10-13; the slug section and the legacy STWK checks print their skip notices). `smoke-create.mjs` whole run on a fresh seed: 12/14, the same two pre-existing CRWT failures as in T14.

**Tests**: manual
**Gate**: manual

**Commit**: `test(worktrees): check the create step and the busy dialog in the start work smoke`

---

### T16: Record the decision and amend the sibling specs

**What**: Write the design's AD-TBD into `.specs/STATE.md` under the next free number (check `main` and open branches first); annotate the `worktree-base-refresh` Out of Scope row "No interactive credential handling" (a helper that waits is now bounded by the fetch timeout, CRTO-02) and the `worktree-post-create-hook` spec (the command runs with stdin ignored, CRTO-07); set this spec's traceability rows to their implemented tasks.
**Where**: `.specs/STATE.md` (annotations in the two sibling specs and this spec)
**Depends on**: T15
**Reuses**: the AD-048 / AD-051 entry shape
**Requirement**: CRTO-02, CRTO-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The AD number is unused on `main` and on the open branches named in `STATE.md`
- [x] `python <skill-dir>/scripts/validate_spec.py .specs/features/create-timeouts/spec.md` exits 0
- [x] Gate check passes: `npm run lint && npm test` (lint 0 errors, 18 warnings; 123 files, 2669 passed; typecheck exit 0)

**Notes** (2026-10-03): the decision is **AD-059**. After `git fetch origin`, `origin/main` holds up to AD-057 (#162, merged); `obogoni/playground` has no open PR; among the local branches and sibling worktrees the highest is AD-058 (`git-recount-coalesce`, local), and none holds AD-059. #161 (`feature/branch-slug-short`, this branch's base) merged on 2026-10-03, so the rebase onto `origin/main` the plan calls for is now due. The entry follows design.md's AD-TBD with the reconciliation: `pathCheck` in the factory, the stdin end inside the pacer, the limit's wording (`limitText`). Traceability rows read `Implemented`; CRTO-02 and CRTO-07 also point to AD-059.

**Tests**: none
**Gate**: full

**Commit**: `docs(specs): record the create timeouts decision`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1
Phase 2:  T1 ------→ T2 ------→ T3
Phase 3:  T3 ------→ T4 ------→ T5 ------→ T6
Phase 4:  T6 ------→ T7 ------→ T8 ------→ T9
Phase 5:  T9 ------→ T10 -----→ T11 -----→ T12 -----→ T13
Phase 6:  T13 -----→ T14 -----→ T15 -----→ T16
```

Sixteen tasks in six phases: about three batches (Phases 1–3, 4–5, 6). At Execute the sub-agent offer is made first. Phases 1–4 are main-process logic (unit-gated); Phase 5 is the renderer; Phase 6 needs the dev app.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: fixture | 1 fixture module + its test | ✅ Granular |
| T2: git stdin | 1 function + 1 type | ✅ Granular |
| T3: hook stdin | 1 spawn option | ✅ Granular |
| T4: runner and limits | 1 factory over the create path's helpers | ⚠️ Cohesive (one parameter threaded through one file) |
| T5: refresh texts | 1 function | ✅ Granular |
| T6: checkout text | 1 function | ✅ Granular |
| T7: create steps | 1 parameter, 2 call points, 1 type | ✅ Granular |
| T8: decorator steps | 1 function + its type | ✅ Granular |
| T9: IPC | 1 handler + 2 contract entries | ⚠️ Cohesive (typecheck stays green, L-001) |
| T10: labels | 1 pure module | ✅ Granular |
| T11: hook | 1 hook | ✅ Granular |
| T12: New worktree dialog | 1 component + its stylesheet | ⚠️ Cohesive |
| T13: Start Work dialog | 1 component | ✅ Granular |
| T14, T15: smoke | 1 section each | ✅ Granular |
| T16: decision | 1 AD + 3 annotations | ⚠️ Cohesive |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |

No task depends on a later phase.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: fixture | Test fixture | unit | unit | ✅ OK |
| T2: git stdin | Main runner | unit | unit | ✅ OK |
| T3: hook stdin | Main runner | unit | unit | ✅ OK |
| T4: runner and limits | Main create path | unit | unit | ✅ OK |
| T5: refresh texts | Main create path | unit | unit | ✅ OK |
| T6: checkout text | Main create path | unit | unit | ✅ OK |
| T7: create steps | Main create path | unit | unit | ✅ OK |
| T8: decorator steps | Main decorator | unit | unit | ✅ OK |
| T9: IPC | IPC contract and wiring | none | none | ✅ OK |
| T10: labels | Renderer pure lib | unit | unit | ✅ OK |
| T11: hook | Renderer hook | none | none | ✅ OK |
| T12: New worktree dialog | Dialog component and CSS | none (CDP smoke) | none | ✅ OK |
| T13: Start Work dialog | Dialog component | none (CDP smoke) | none | ✅ OK |
| T14: smoke | End to end | manual | manual | ✅ OK |
| T15: smoke | End to end | manual | manual | ✅ OK |
| T16: decision | Docs | none | none | ✅ OK |

## Requirement → Evidence Map

| Requirement | Evidence planned |
| ----------- | ---------------- |
| CRTO-01 | T4 recording-runner tests |
| CRTO-02 | T1 fixture and evidence; T5 never-settling, literal and real-git tests |
| CRTO-03 | T5 never-settling and literal tests (both fast-forward forms) |
| CRTO-04 | T5 recreate test |
| CRTO-05 | T12, T13 (inline error path unchanged); T14 smoke |
| CRTO-06 | T2 `hash-object --stdin` test |
| CRTO-07, CRTO-08 | T3 real-process hook tests |
| CRTO-09 | T4 recording-runner tests on all four `worktree add` paths |
| CRTO-10 | T6 tests and the decorator test |
| CRTO-11 | T7, T8 tests; T9 wiring; T14, T15 smoke label |
| CRTO-12, CRTO-14 | T7 step sequences |
| CRTO-13 | T8 tests |
| CRTO-15 | T7, T8 sequences (order, each once) |
| CRTO-16, CRTO-17 | T10 tests; T11 hook; T14, T15 smoke label |
| CRTO-18 | T9 handler (review); T7 "no `onStep`" test |
| CRTO-19, CRTO-20 | T12, T13; T14 (both), T15 (both) smoke |
| CRTO-21 | T12, T13 review |
