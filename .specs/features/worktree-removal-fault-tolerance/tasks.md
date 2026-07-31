# Worktree Removal Fault Tolerance Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/worktree-removal-fault-tolerance/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found:
> `.specs/codebase/TESTING.md` (authoritative), `vitest.config.ts` (coverage scoped to `src/main` +
> `src/shared`; renderer and thin shells intentionally excluded), `.github/workflows/ci.yml` (gate =
> `typecheck && lint && test`), `.specs/STATE.md` AD-003 (coverage is report-only), AD-004/AD-011
> (renderer units not tested by convention), AD-005 (Windows-only; tests assert backslash paths).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Main-process deep modules with logic (`dir-remover`, `WorktreeManager`, `SessionManager`) | **unit** | All branches; 1:1 to spec ACs; every listed edge case has a test | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (porcelain `locked` parsing, `classifyTargetPath`, leftover message) | **unit** | Input→output for every documented mapping, including the edge cases | co-located `src/main/*.test.ts` | `npm test` |
| Shared types (`src/shared/worktrees.ts`, `ipc-contract.ts`) | none — build gate only | — | — | `npm run typecheck` |
| Thin OS/Electron shells (`index.ts` IPC wiring) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer React components (`WorktreeDetail`, dialogs, `LeftoverPathChoice`) | none (CDP smoke + visual pass) | — | — | `node scripts/smoke-remove.mjs` |
| Out-of-CI smoke scripts | manual only | — | `scripts/smoke-*.mjs` | `node scripts/smoke-remove.mjs` (live session) |

**Deviation from TESTING.md worth stating:** TESTING.md says "no mocking library is used anywhere
(no `vi.mock`); fakes are hand-rolled and injected" — this feature conforms (the deleter is injected via a
defaulted `deps` param, never mocked). It also lists no fake-timer usage; `dir-remover.test.ts` introduces
`vi.useFakeTimers()` for the retry cadence. That is a **new pattern for this repo**, chosen because the
alternative (real 3 s waits) would add ~10 s to the suite and invite the flakiness lesson L-005 warns about.

## Parallelism Assessment

> Generated from codebase — confirm before Execute.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| Unit (pure) | **Yes** | No shared state; input→output | `tree.test.ts`, `shortcut-launcher.test.ts` |
| Unit (temp-dir, real git) | **Yes** | Per-test `realpathSync.native(mkdtempSync(...))` + `rmSync` teardown | `worktree-manager.test.ts:30-46` |
| Unit (injected fake) | **Yes** | Hand-rolled fakes per test, no globals | `task-board.test.ts`, `post-create-hook.test.ts` |
| Unit (fake timers) | **Yes** | `vi.useFakeTimers()` scoped per file, restored in `afterEach`; no real fs in those tests | new in `dir-remover.test.ts` |
| Unit (spawns a real holder process) | **Yes**, but slow | Own temp dir + own child process, killed in `afterEach` | new; mirrors `hook-shell.test.ts` real-process style |
| CDP smoke | **No** | Single live app on a fixed debug port + shared disk state | `scripts/smoke-*.mjs` |

⚠️ **Lesson L-005 applies to T2 and T7**: `worktree-manager.test.ts` already raises its own timeouts
(`vi.setConfig({ testTimeout: 30000 })` at line 445) because real-git tests get starved under parallel
load. Every new real-process/real-git test must set an explicit generous timeout rather than inherit the
5 s default.

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | After a logic-bearing task / before PR | `npm run typecheck && npm run lint && npm test` |
| **Build** | After phase completion | `npm run build:win` |
| **Manual** | Renderer/user-facing behavior | `node scripts/smoke-remove.mjs` (live session) |

**Baseline:** **533 tests / 39 files green** — established *after* T0; the two runs before it were red
(`2 failed`, then `14 failed`) purely from timeout starvation. Every task's expected count is
`533 + N` with **zero deletions**. Note TESTING.md's own header still cites the stale 125/11 figure —
anchor to the live run, not to that line.

---

## Execution Plan

### Phase 0: Make the gate trustworthy (Sequential)

Added during Execute, before T1, after two baseline runs of untouched `main` came back red.

```
T0
```

### Phase 1: The deleter (Sequential)

```
T1 → T2
```

### Phase 2: Ordering, guards and the session wait (Parallel OK)

```
        ┌→ T3 ─→ T4 ─→ T5 ─┐
T2 ─────┤                  ├──→ (Phase 3)
        └→ T6 [P] ─────────┘
```

### Phase 3: Surfacing it (Sequential)

```
T5, T6 → T7 → T8
```

### Deferred to a follow-up PR (owner decision, during Tasks approval)

T9–T11 (WRFT-07, the create-time leftover collision) **are not executed on this branch.** They stay
specified below so the follow-up feature can lift them verbatim. This branch ships WRFT-01..06; the
follow-up ships WRFT-07 on top of the deleter and classification seams this branch creates.

```
(follow-up PR)  T9 → T10 → T11
```

---

## Task Breakdown

### T0: Stabilize the test gate (added during Execute)

**What**: Raise Vitest's global test/hook timeouts and widen one racing fixture window, so the gate is
deterministic before this feature adds more real-git and real-process tests.
**Where**: `vitest.config.ts`, `src/main/hook-shell.test.ts`
**Depends on**: None
**Reuses**: the local precedent at `worktree-manager.test.ts:445` (`vi.setConfig({ testTimeout: 30000 })`)
**Requirement**: none — enabling work for every task's gate

**Why it exists**: two full runs of untouched `main` failed — `2 failed | 531 passed`, then
`14 failed | 519 passed` across 5 files. Every failure was a duration overrun against the 5 s default
(11 430–15 557 ms), and `tree.test.ts` passed alone in 9.3 s. This is candidate lesson **L-005 recurring on
a second feature** (first seen in `worktree-post-create-hook`), which qualifies it for promotion to
confirmed. With a gate failing 2–14 random tests per run, no task's "gate passes" claim means anything.

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `vitest.config.ts` sets `testTimeout: 30000` and `hookTimeout: 30000`, with a comment recording the
      measurement that motivated it
- [x] `hook-shell.test.ts:96` passes `timeoutMs: 1500` instead of `500` (owner-approved fixture fix): under
      load `ping` emitted nothing before the kill, so the output-tail assertion saw `''`. `ping -n 5` still
      runs ~4 s, so the command is still killed mid-flight — **no assertion weakened, no production code
      touched**
- [x] Full suite green: **533 passed / 39 files, 0 failed** (149.5 s) — typecheck clean, lint 0 errors /
      18 pre-existing warnings (unchanged count)
- [x] No test deleted, skipped, or weakened

**Tests**: none (test infrastructure)
**Gate**: full — `npm run typecheck && npm run lint && npm test`
**Commit**: `test(infra): stop the real-git suites racing the default timeout`

---

### T1: Create the junction-safe bounded deleter

**What**: New `dir-remover.ts` exporting `removeDirTree(path, deps?)`, the two retry constants, and the
`DirRemovalResult`/`RemovalLeftover` shapes it returns.
**Where**: `src/main/dir-remover.ts` (new), `src/shared/worktrees.ts` (add `RemovalLeftover`)
**Depends on**: None
**Reuses**: DI-with-defaults convention (`SessionManagerDeps`, `withPostCreateHook`)
**Requirement**: WRFT-04 (AC 1, 2, 4), WRFT-02 (AC 4), WRFT-03 (mechanism)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `removeDirTree` implements the design's loop: `maxRetries: 0` per attempt, retry only on
      `EBUSY`/`EPERM`/`ENOTEMPTY`/`EACCES`, `DELETE_RETRY_INTERVAL_MS = 250` between attempts, giving up at
      `DELETE_RETRY_BUDGET_MS = 3000`
- [x] A code comment states **why** `maxRetries: 0` is mandatory (measured 21 599 ms for `maxRetries: 5`)
      so a future reader does not raise it
- [x] Returns `{ ok: true }` immediately when the path does not exist (WRFT-02 AC 4)
- [x] On give-up returns `{ ok: false, code, leftover: { blockedPath, remaining } }`; `remaining` counts
      entries still under the root
- [x] Non-retryable codes return immediately without consuming the budget
- [x] `deps` (`rm`, `exists`, `readEntries`) default to the real fs functions; no `vi.mock` anywhere
- [x] Unit tests with fake deps + `vi.useFakeTimers()`: retry cadence (assert the **literal** 250 ms
      spacing), budget exhaustion (**literal** 3000 ms), success after N transient failures, non-retryable
      immediate return, missing-path no-op, leftover payload contents
- [x] One test pins the exported constants to their literal values (`250`, `3000`) — lesson L-004
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 9 (no silent deletions) — **542 passed / 40 files**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(worktree): add junction-safe bounded directory remover`

---

### T2: Prove the deleter against real filesystem hazards

**What**: Real-fs tests for the three hazards that decide whether delete-first is safe at all: junction
targets, read-only content, and a genuinely locked directory.
**Where**: `src/main/dir-remover.test.ts` (extend)
**Depends on**: T1
**Reuses**: real-temp-dir pattern (`TESTING.md` §2), real-process style from `hook-shell.test.ts`
**Requirement**: WRFT-03 (AC 1, 2, 3), WRFT-04 (AC 3, 5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] **Junction test asserts the TARGET's contents survive** (`precious.txt` + `nested/deep.txt` still
      readable after removal) — not merely that the worktree folder is gone. Written so it would FAIL
      against a git-based deleter (it also reads through the junction *before* removing, so the assertion
      cannot pass vacuously)
- [x] Dangling-junction test: target deleted first, removal still succeeds (WRFT-03 AC 3)
- [x] Read-only file (`chmod 0o444` + `attrib +R`) and a nested real git repo (`0444` object store) both
      delete successfully
- [x] Real-lock test: a child process with `cwd` inside the tree (`spawn(process.execPath, ['-e',
      'setTimeout(…)'], { cwd })`) blocks deletion → asserts `ok: false`, the `leftover` payload, and that
      the call returns within 5000 ms (WRFT-04 AC 5); after killing the holder a retry succeeds
- [x] Every test in this task sets an **explicit** timeout (lesson L-005) — 30000, matching T0's new global
      so the ceiling is unchanged; the holder process is killed in `afterEach` even when the test fails
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 9 + 6 (no silent deletions) — **548 passed / 40 files**

**Tests**: unit (real-fs)
**Gate**: quick
**Commit**: `test(worktree): pin junction safety, read-only and real-lock deletion`

---

### T3: Parse the porcelain `locked` line

**What**: Extend `PorcelainBlock` with `locked?: string` and teach `parsePorcelainBlocks` to read the
`locked [reason]` line.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T2
**Reuses**: `parsePorcelainBlocks` (`worktree-manager.ts:316-339`)
**Requirement**: WRFT-01 (AC 3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `locked` with a reason yields the reason string; bare `locked` yields `''`; absent yields `undefined`
      (the three cases are distinguishable — `''` must not read as "unlocked")
- [x] `listWorktrees` and `worktreeHosting` behavior is unchanged (additive field only)
- [x] Unit tests on a real temp repo using `git worktree lock --reason …` and a bare `git worktree lock`
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 15 + 3 (no silent deletions) — **551 passed / 40 files**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(worktree): parse the porcelain locked line`

---

### T4: Reorder removeWorktree to delete-then-deregister

**What**: Rewrite `removeWorktree`'s body to the design's 6-step guard table, with the deleter injected as a
defaulted 4th param.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T3
**Reuses**: `samePath`, `gitFailureLine`, `statusOf`, T1's `removeDirTree`
**Requirement**: WRFT-01 (all), WRFT-02 (AC 1, 3, 4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Guard order is primary → registered → locked → dirty → delete → bookkeeping; **every** guard refuses
      before any deletion
- [x] Unregistered path refuses and deletes nothing (the anti-`rm -rf` guard); `git worktree list` failure
      fails **closed**
- [x] Locked worktree refuses with git's reason, under plain **and** `force: true` calls (plus a bare
      `locked` line, whose reason parses to `''` and must still refuse)
- [x] Primary refuses under `force: true`; dirty refuses without force — both messages byte-identical to
      today's (DLWT/FRWT regression)
- [x] Deletion failure returns `{ ok: false }` whose `error` names the blocked path + remaining count, and
      `git worktree remove` is **never invoked** — asserted by checking the worktree is still in
      `git worktree list --porcelain`. The **structured `leftover` field lands in T5** with its renderer
      consumer, per lesson L-001 (do not ship the field with no consumer)
- [x] Bookkeeping runs only after the directory is gone; a bookkeeping failure returns git's first line and
      a retry succeeds
- [x] 3-arg call sites (`index.ts`, `workflow-ctx`) compile unchanged
- [x] Unit tests on real temp repos for each guard + the ordering + the already-absent path; retry-policy
      cases use an injected fake deleter
- [x] All existing `removeWorktree` tests still pass **unmodified**
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: baseline + 18 + 10 (no silent deletions) — **561 passed / 40 files**

**Tests**: unit
**Gate**: full
**Commit**: `fix(worktree): delete the worktree before deregistering it`

---

### T5: Carry the leftover through IPC and render it

**What**: Widen `RemoveWorktreeResult` with `leftover`, thread it through the contract, and render the
blocked path + count in the Danger section. **Producer and consumer land together (lesson L-001).**
**Where**: `src/shared/worktrees.ts`, `src/shared/ipc-contract.ts`, `src/renderer/src/components/WorktreeDetail.tsx`, `WorktreeDetail.css`
**Depends on**: T4
**Reuses**: existing `.detail-danger-note.error` treatment; `setRemoving(false)` failure branch
**Requirement**: WRFT-04 (AC 3), WRFT-06 (all)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `RemoveWorktreeResult.leftover?: RemovalLeftover`; `worktrees:remove` res widened; no `any`
- [x] The failure message names the blocked path, the remaining count, and says the worktree is still
      registered and can be retried; count pluralizes (`1 item` / `N items`)
- [x] `WorktreeDetail` stores and clears `removeLeftover` on every new attempt, and renders the path in
      monospace with `word-break: break-all` plus the count. **Deviation from design.md:** the structured
      block *replaces* the flat error line rather than sitting below it — T4's main-side `error` is
      self-contained (WRFT-04 AC 3 needs it for non-interactive callers), so rendering both would print
      the long path twice. Every non-leftover failure still renders the flat line
- [x] Button returns to enabled after failure (verify the existing `setRemoving(false)` path — no
      regression); the row is still present after a refresh
- [x] Typecheck passes across node + web projects
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: baseline + 28 + 0 (renderer untested by convention; no deletions) — **561 passed / 40 files**

**Tests**: none (renderer + shared types — matrix says build gate / smoke)
**Gate**: full
**Commit**: `feat(worktree): surface the blocked path when removal is left over`

---

### T6: Make session stop await the real PTY exit [P]

**What**: `SessionManager.stop` returns a promise resolving on the PTY's real exit, capped at
`SESSION_EXIT_WAIT_MS = 3000`, with `killAll` explicitly left fire-and-forget.
**Where**: `src/main/session-manager.ts`, `src/main/index.ts` (handler awaits)
**Depends on**: T2
**Reuses**: existing idempotent `#finalize`, the `handle.onExit` registration in `#start`
**Requirement**: WRFT-05 (AC 1, 2, 3, 4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `#start` stores an `exited` promise resolved from the existing `onExit` callback; `stop` captures it
      before `#finalize` drops the Map entry
- [x] `stop` still finalizes **immediately** (status flips to stopped synchronously — all 7 existing
      `manager.stop(...)` call sites keep passing unmodified)
- [x] The wait is capped at 3000 ms; the timer is cleared in `finally` and `unref`'d, with a comment
      distinguishing this from lesson L-003's grace timer (here the promise is awaited by a live caller, so
      `unref` cannot skip work)
- [x] `killAll()` stays synchronous (`void this.stop(id)`) with a comment stating why (quit must not stall
      up to 3 s per session)
- [x] Unit tests with a fake PTY port: resolves only after the fake's exit fires; resolves anyway after the
      cap for a port that never exits (fake timers, real constant); existing session tests unmodified
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 28 + 3 (no silent deletions) — **564 passed / 40 files**

**Note on `index.ts`**: no code change was needed — `handle('sessions:stop', ({ id }) => sessions.stop(id))`
already returns the promise and `ipcMain.handle` awaits it, so the channel resolves on the real exit the
moment `stop` became async. A comment was added at that line recording why the `return` is load-bearing.

**Tests**: unit
**Gate**: quick
**Commit**: `fix(sessions): resolve stop only once the PTY has really exited`

---

### T7: Extend the remove smoke with a real lock

**What**: Extend `scripts/smoke-remove.mjs` with the blocked-then-retry flow against a live app.
**Where**: `scripts/smoke-remove.mjs`, `scripts/seed-smoke-remove.mjs` if seeding needs it
**Depends on**: T5, T6
**Reuses**: existing CDP smoke structure and its check-count reporting
**Requirement**: WRFT-06 (AC 1, 2, 3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Smoke spawns a holder process inside a seeded worktree, clicks Remove, asserts the inline error names
      the blocked path and that the row survives a tree refresh
- [x] Kills the holder, clicks Remove again, asserts the row disappears and the toast shows the branch
- [x] Holder process is killed even when the script fails (no leaked processes on a failed run) — the whole
      WRFT-06 section sits in `try`/`finally`
- [x] Script documents that it needs a live session (never CI), per TESTING.md
- [ ] **OUTSTANDING (owner-run)**: `node scripts/smoke-remove.mjs` passes on a live session. Not run here —
      a CDP smoke needs a live desktop session and a seeded workspace, and launching the app from an agent
      would interfere with the owner's desktop. Verified instead by `node --check` on both scripts and by
      reading them against the T5 renderer markup (`.detail-danger-leftover`, `.detail-danger-path`)
- [x] Test count: unchanged (smoke is not part of `npm test`) — **564 passed / 40 files**

**Seeding change**: the two existing seeded worktrees are both removed by the earlier checks, so the seed
gained a third — `api-lock-me` (branch `lock/me`) with an empty `sub/`. Empty directories are invisible to
`git status`, so the worktree still reads clean and the first Remove click takes the direct path rather than
the confirm dialog. The holder parks its cwd in `sub/`, which makes `sub` the reported `blockedPath` and
leaves `remaining: 1` — mirroring the real-lock unit test at `dir-remover.test.ts:322`.

**Known consequence, asserted around**: a blocked deletion still removes everything it *could* reach,
including the worktree's `.git` link file, so on the retry the row may read clean (direct remove) or dirty
(confirm dialog) depending on what survived. The retry step clicks `.dialog-btn-danger` optionally so either
shape passes — the requirement is that the retry succeeds, not which path it takes.

**Tests**: none (manual smoke — matrix: renderer layer)
**Gate**: manual
**Commit**: `test(worktree): smoke the blocked-removal retry flow`

---

### T8: Record AD-014 and update the spec's traceability

**What**: Record the delete-first invariant as a project-level decision and mark WRFT-01..06 verified.
**Where**: `.specs/STATE.md`, `.specs/features/worktree-removal-fault-tolerance/spec.md`
**Depends on**: T7
**Reuses**: existing AD-NNN format
**Requirement**: traceability for WRFT-01..06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] AD-014 states: worktree removal is delete-first; no surface may use `git worktree remove --force` as a
      *deleter*; the junction rationale is recorded (git for Windows recurses into junctions); the guard
      order (primary → registered → locked → dirty) and why the lock check must be ours (git's own refusal
      would arrive *after* deletion); and records that **WRFT-07 is deferred to a follow-up PR** (owner
      decision at Tasks approval)
- [x] Spec traceability rows for WRFT-01..06 move to their real status — **`⚙ Implemented — pending
      Verifier`**, not Verified: the independent Verifier has not run. **WRFT-07 is marked Deferred** with a
      pointer to the follow-up; the WRFT-07 AC 1 wording is corrected (the app's own `existsSync` guard at
      `worktree-manager.ts:87-89` fires before git's `fatal`, so this upgrades an existing flat error rather
      than replacing a git error)
- [x] Handoff section updated with the commit map — **section-scoped write**: only the `## Decisions` row
      append and the `## Handoff` body changed; `git diff` confirms no existing AD row was touched
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` — **564 passed / 40 files**, 0 lint
      errors / 18 pre-existing warnings

**Tests**: none (docs)
**Gate**: quick
**Commit**: `docs(specs): record AD-014 delete-first worktree removal`

---

## Deferred tasks (follow-up PR — not executed on this branch)

### T9: Classify what sits at a create target ⏸ DEFERRED

**What**: `classifyTargetPath(target)` returning `free | empty | leftover | occupied`, replacing the flat
`existsSync` guard in `createWorktree`.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T8
**Reuses**: the existing guard site (`worktree-manager.ts:87-89`)
**Requirement**: WRFT-07 (AC 1, 4, 5)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `free` (absent) and `empty` both proceed to `git worktree add` (empty is accepted by git — verified)
- [ ] `occupied` (contains `.git`, file or directory) refuses with a "already contains a repository or
      worktree" message and offers no cleanup
- [ ] `leftover` (non-empty, no `.git`) returns `{ ok: false, conflict: 'path-exists', pathConflict: { path,
      entries }, error }` — `error` is set too, so non-interactive callers (`ctx.worktree.create`) get a
      usable message
- [ ] **Expected test edit**: `worktree-manager.test.ts:428` ("short-circuits on target-path collision")
      currently uses an **empty** dir, which must now proceed. Change the fixture to a non-empty leftover so
      the ordering assertion survives, and add a separate test pinning empty-dir passthrough. This is the
      one intentional edit to an existing test — call it out in the commit body
- [ ] Unit tests on real temp repos for all four classifications
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 31 + 5 (1 existing test modified, 0 deleted)

**Tests**: unit
**Gate**: full
**Commit**: `feat(worktree): classify what occupies a create target`

---

### T10: Add the clean-path channel ⏸ DEFERRED

**What**: `cleanWorktreePath(repoPath, branch, worktreeTemplate?, deps?)` plus the
`worktrees:clean-path` IPC channel.
**Where**: `src/main/worktree-manager.ts`, `src/shared/ipc-contract.ts`, `src/main/index.ts`
**Depends on**: T9
**Reuses**: `worktreePathFor`, `classifyTargetPath` (T9), `removeDirTree` (T1)
**Requirement**: WRFT-07 (AC 2, 3, 4)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] The channel takes `{ repoPath, branch, worktreeTemplate? }` — **never a raw path**; the handler
      recomputes the target with `worktreePathFor`
- [ ] Refuses unless the recomputed target classifies as `leftover` (so `occupied`/`free` can never be
      deleted); returns `RemoveWorktreeResult` including `leftover` on failure
- [ ] Unit tests: cleans a leftover; refuses an `occupied` target; refuses when the recomputed target does
      not exist; a deletion failure surfaces the leftover payload
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: baseline + 36 + 4 (no silent deletions)

**Tests**: unit
**Gate**: full
**Commit**: `feat(worktree): add the guarded clean-path channel`

---

### T11: Offer clean-and-continue in both create dialogs ⏸ DEFERRED

**What**: `LeftoverPathChoice` component + wiring in both create dialogs.
**Where**: `src/renderer/src/components/LeftoverPathChoice.tsx` (new) + `.css`, `NewWorktreeDialog.tsx`, `StartWorkDialog.tsx`
**Depends on**: T10
**Reuses**: `BranchExistsChoice.tsx` structure; the dialogs' existing `conflict` state machine
**Requirement**: WRFT-07 (AC 1, 2, 3)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `conflict` state widens to `'branch-exists' | 'path-exists'` in both dialogs
- [ ] The choice states the path and entry count, with a danger "Delete folder & create" primary and Cancel
- [ ] Confirm calls `worktrees:clean-path`, then re-invokes `worktrees:create` unchanged; a cleanup failure
      shows the leftover inline and creates nothing
- [ ] Visual pass against `BranchExistsChoice`'s existing styling
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`; smoke re-run for the create path
- [ ] Test count: baseline + 40 + 0 (renderer untested by convention)

**Tests**: none (renderer — matrix: CDP smoke + visual)
**Gate**: full + manual
**Commit**: `feat(worktree): offer to clear a leftover folder before creating`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2

Phase 2:
  T2 complete, then:
    T3 ──→ T4 ──→ T5      (sequential chain: same file, then its consumers)
    T6 [P]                 (independent module: session-manager)

Phase 3 (Sequential):
  T5 + T6 complete, then:
    T7 ──→ T8

Deferred (follow-up PR, not this branch):
  T9 ──→ T10 ──→ T11
```

**Phase count note:** with T9–T11 deferred this branch has **3** phases, which is the skill's inline
threshold. The owner nonetheless chose one sub-agent worker per phase during Tasks approval, so Execute
runs with three sequential phase workers plus the always-on independent Verifier.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: deleter module | 1 module + 1 type | ✅ Granular |
| T2: real-fs hazard tests | 1 test file | ✅ Granular |
| T3: porcelain `locked` | 1 function | ✅ Granular |
| T4: reorder `removeWorktree` | 1 function | ✅ Granular |
| T5: leftover through IPC + render | 1 type + 1 channel + 1 component (one cohesive slice, L-001) | ⚠️ OK — deliberately cohesive |
| T6: awaitable `stop` | 1 method | ✅ Granular |
| T7: smoke extension | 1 script | ✅ Granular |
| T8: AD-014 + traceability | docs only | ✅ Granular |
| T9: `classifyTargetPath` | 1 function | ✅ Granular |
| T10: clean-path channel | 1 function + 1 channel | ✅ Granular |
| T11: leftover choice UI | 1 component + 2 wirings | ⚠️ OK — same pattern as `BranchExistsChoice` |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (root) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T2 | T2 → T6 `[P]` | ✅ Match |
| T7 | T5, T6 | T5 + T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |

T6 is the only `[P]` task; it shares no file and no state with T3/T4/T5 (`session-manager.ts` vs
`worktree-manager.ts`), and its tests are parallel-safe injected fakes.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Main-process deep module (`dir-remover`) | unit | unit | ✅ OK |
| T2 | Same module, real-fs hazards | unit | unit | ✅ OK |
| T3 | Extracted pure helper (porcelain parsing) | unit | unit | ✅ OK |
| T4 | Main-process deep module (`WorktreeManager`) | unit | unit | ✅ OK |
| T5 | Shared types + renderer component | none (build gate) + none (smoke) | none | ✅ OK |
| T6 | Main-process deep module (`SessionManager`) | unit | unit | ✅ OK |
| T7 | Smoke script | manual only | none (manual) | ✅ OK |
| T8 | Docs | — | none | ✅ OK |
| T9 | Extracted pure helper + `WorktreeManager` | unit | unit | ✅ OK |
| T10 | Main-process deep module + IPC wiring | unit (module) / none (wiring) | unit | ✅ OK |
| T11 | Renderer components | none (CDP smoke + visual) | none | ✅ OK |

No violations. T5 and T11 carry `Tests: none` **only** because the matrix assigns "none" to shared types,
IPC wiring and renderer components — not because their tests were deferred; their behavior is covered by
T4/T10 unit tests below and by the T7 smoke above.

**Scope of the three validation tables:** rows T9–T11 describe the deferred follow-up work and are kept for
that PR to lift verbatim. This branch's approval covers T1–T8 only.

---

## Fix round 1 (from `validation.md`, Verifier round 1 — both gaps are test-strength, not defects)

The Verifier returned FAIL with **2 surviving mutants** (M6, M13). Both survivors were *unasserted
outcomes*, not wrong behavior: the implementation is correct on every path examined, so **no production
code changed in this round**. Each fix is proved by re-running the exact mutation the Verifier used and
observing the new assertion fail.

### F1: Assert the leftover payload the renderer branches on

**Gap**: WRFT-04 AC 3c — `RemoveWorktreeResult.leftover` was never asserted. The three `leftover:`
occurrences in `worktree-manager.test.ts` (`:844`, `:867`, `:882`) are fixture **inputs** handed to
`spyDeleter`, never expectations on the value `removeWorktree` returns. Mutation **M6** — dropping
`leftover` from the failure result at `worktree-manager.ts:335-339` — left all **80 tests green**. This is
exactly the payload/conjunction trap: the value goes in and nothing checks it comes back out.
`WorktreeDetail.tsx:135` branches on `result.leftover`, so losing it silently degrades the UI from the
structured two-row block (WRFT-06 AC 1/AC 4) to the flat error line.

**Where**: `src/main/worktree-manager.test.ts` (test-only; additions only, nothing weakened or removed)
**Requirement**: WRFT-04 AC 3

**Fix**:

- `:852` — `expect(failed.leftover).toEqual({ blockedPath: blocked, remaining: 3 })` in the give-up test
- `:880-882` — `expect(result.leftover).toEqual({ blockedPath: blocked, remaining: 3 })` plus a per-field
  check on `.blockedPath` and `.remaining` in the failure-message test (message **and** payload)
- `:936` — `expect(result.leftover).toBeUndefined()` on the locked-guard refusal: `shared/worktrees.ts:110-116`
  documents "never on a guard refusal", and that half was unasserted too

**Mutation evidence (M6 — `leftover: { blockedPath, remaining }` removed from the returned object)**:

```
FAIL src/main/worktree-manager.test.ts > removeWorktree > never invokes git and keeps the
     worktree registered when deletion gives up
FAIL src/main/worktree-manager.test.ts > removeWorktree > names the blocked path, the remaining
     count and the retry in the failure message
AssertionError: expected undefined to deeply equal { …(2) }
  - Expected: { "blockedPath": "…\repo-feature-x\a.txt", "remaining": 3 }
  + Received: undefined
Tests  2 failed | 18 passed | 60 skipped (80)
```

Before: `80 passed (80)` — **survived**. After: **2 failed — killed**. Production file restored from a
byte-identical backup (`git diff src/main/worktree-manager.ts` empty) before the gate and the commit.

**Test count**: 564 → 564 (assertions added to existing tests; no new test cases, no deletions)
**Tests**: unit
**Gate**: full — `npm run typecheck && npm run lint && npm test`
**Commit**: `test(worktree): assert the leftover payload the renderer branches on`

---

### F2: Pin the recursive leftover count against real fs

**Gap**: WRFT-04 AC 3e — the real recursive `remaining` count was unpinned. The exact-count assertions at
`dir-remover.test.ts:148` / `:156` drive the **injected fake** `readEntries`, so they cannot see a change to
the real-fs wiring; `:323`'s `toBeGreaterThanOrEqual(1)` was the only real-filesystem check and is satisfied
by any non-zero count. Mutation **M13** — `readdir(path, { recursive: true })` → `readdir(path)` — left all
**15 tests green**, so a wrong-but-plausible number could reach the user's error message undetected.

**Where**: `src/main/dir-remover.test.ts` (test-only; the `:323` assertion is kept, the new test sits
alongside it)
**Requirement**: WRFT-04 AC 3

**Fix**: a new real-fs test, `counts the leftovers recursively, not just the direct children of the root`
(`:328-348`), asserting `expect(result.leftover).toEqual({ blockedPath: held, remaining: 3 })`.

The fixture is built so the two readings **cannot coincide**: the tree is directories only
(`wt/keep/a/b`), so a failed attempt deletes nothing and the residue is deterministic, and the external
holder's cwd sits three levels down. A recursive read reports **3** (`keep`, `keep\a`, `keep\a\b`) where a
non-recursive read of the root reports **1**. Verified out-of-band with a standalone probe before the
literal was written: `{ code: 'EBUSY', pathIsHeld: true, recCount: 3, topCount: 1 }`.

**Mutation evidence (M13 — `readEntries: (path) => readdir(path)`)**:

```
FAIL src/main/dir-remover.test.ts > removeDirTree against the real filesystem > counts the
     leftovers recursively, not just the direct children of the root
AssertionError: expected { …(2) } to deeply equal { …(2) }
  { "blockedPath": "…\wt\keep\a\b",
  -   "remaining": 3,
  +   "remaining": 1, }
Tests  1 failed | 15 passed (16)
```

Before: `15 passed (15)` — **survived**. After: **1 failed — killed**. Production file restored from a
byte-identical backup (`git diff src/main/dir-remover.ts` empty) before the gate and the commit.

**Test count**: 564 → 565 (+1 test, +0 files, zero deletions)
**Tests**: unit
**Gate**: full — `npm run typecheck && npm run lint && npm test`
**Commit**: `test(worktree): pin the recursive leftover count against real fs`

---

**Not done in this round, deliberately:** Verifier Fix 3 (amend WRFT-04 AC 3 to say the count is
*recursive*, spec-precision gap P2) touches `spec.md`, which is outside this round's scope. F2's fixture
makes the recursive reading the only one that passes, so the ambiguity is now pinned by test even though
the prose still allows both readings. WRFT-06 remains blocked on the owner's live smoke run.

---

## Fix round 2 (from `validation.md`, Verifier round 2 — again both gaps are test-strength)

Round 1's two survivors were confirmed killed, but two **new** adversarial probes survived (N3, N6). Both
are the same family one step narrower: each fix had been shaped around the single mutation that was known,
so a neighbouring wrong reading still passed. No production code changed in this round either.

### F3: Pin the leftover count against a mixed file and directory residue

**Gap**: WRFT-04 AC 3b — the amended AC says `remaining` is the recursive count of **every entry**, but F2's
fixture (`wt/keep/a/b`) is *directories only* by construction, so a directories-only count reads the same 3
and is indistinguishable from it. Mutation **N3** — `readEntries` filtered to `isDirectory()` — left all
**16 tests green**. In the spec's own headline residue (`sub/`, `sub/deep.txt`, `untracked.txt`) that reports
**1** instead of 3, in exactly the scenario the problem statement describes.

**Where**: `src/main/dir-remover.test.ts` (test-only; the `:328-348` test and the `:323` `>= 1` assertion
are both kept, the new test sits alongside them)
**Requirement**: WRFT-04 AC 3

**Fix**: a new real-fs test, `counts every leftover entry, files as well as directories`, asserting
`expect(result.leftover).toEqual({ blockedPath: held, remaining: 3 })`.

The fixture separates **four** readings at once rather than two. The tree contains nothing but the locked
chain `wt/keep/a/held.txt` — no sibling entry, so no traversal-order dependence — and the holder is an
*external* pwsh process opening `held.txt` with `FileShare.None` (a cwd holder does not protect the files
beside it, and Node's own handles do not block deletion at all: libuv sets `FILE_SHARE_DELETE`). The residue
is exactly `keep`, `keep\a`, `keep\a\held.txt`:

| Reading of `remaining` | Value |
| --- | --- |
| recursive, every entry (**the spec's**) | **3** |
| recursive, directories only (N3) | 2 |
| recursive, files only | 1 |
| top level only (M13) | 1 |

**Mutation evidence** — four variants run against the restored file, one at a time:

```
N3   readEntries filtered to isDirectory()          →  1 failed | 16 passed (17)   - 3 / + 2
     readEntries filtered to isFile()               →  2 failed | 15 passed (17)   - 3 / + 1
     readEntries + 1 phantom entry (off-by-one)     →  2 failed | 15 passed (17)   - 3 / + 4
     readdir(path)          (non-recursive, M13)    →  2 failed | 15 passed (17)   - 3 / + 1
```

N3 before: `16 passed (16)` — **survived**. After: **killed**, and so are the files-only, off-by-one and
non-recursive variants. `dir-remover.test.ts`'s `afterEach` cleanup gained `maxRetries`/`retryDelay` on its
`rmSync`, because Windows releases a killed holder's file handle asynchronously and the temp cleanup would
otherwise fail EPERM on the very file the test held. Production file restored from a byte-identical backup
(`git diff src/main/dir-remover.ts` empty) before the gate and the commit.

**Test count**: 565 → 566 (+1 test, +0 files, zero deletions)
**Tests**: unit
**Gate**: full — `npm run typecheck && npm run lint && npm test`
**Commit**: `test(worktree): pin the leftover count against a mixed file and directory residue`

---

### F4: Assert that no guard refusal reports a leftover

**Gap**: WRFT-04 AC 3e — the amended AC names **four** guards (primary / unregistered / locked / dirty) that
must refuse without a `leftover`, but F1 added `expect(result.leftover).toBeUndefined()` to the *locked*
test only; `toBeUndefined` on `leftover` occurred exactly once in the file. Mutation **N6** — a
`leftover: { blockedPath, remaining: 0 }` on the primary-checkout guard's return — left all **80 tests
green**. It is not cosmetic: `WorktreeDetail.tsx:334` branches on `removeLeftover` to render the
structured "…still registered, so you can retry" block, so a spurious payload tells the user to retry a
refusal that can never succeed.

**Where**: `src/main/worktree-manager.test.ts` (test-only, three added assertions)
**Requirement**: WRFT-04 AC 3

**Fix**: the same one-line assertion on the three unasserted guards — the dirty-without-force test, the
primary-checkout test and the unregistered-path test — leaving the locked one from F1 in place. All four
refusal paths now pin the absence.

**Mutation evidence** — all three guard returns given a stray `leftover` in one run:

```
FAIL  refuses a dirty worktree and leaves it intact
FAIL  refuses the repo's primary checkout                                  ← N6
FAIL  refuses a path that is not a registered worktree of this repo and deletes nothing
AssertionError: expected { …(2) } to be undefined   (×3)
Tests  3 failed | 77 passed (80)
```

N6 alone, run first and on its own: `1 failed | 79 passed (80)` — before the fix it was `80 passed (80)`,
**survived**. Each of the three new assertions is therefore load-bearing, not just the one the Verifier
probed. Production file restored from a byte-identical backup (`git diff src/main/worktree-manager.ts`
empty) before the gate and the commit.

**Test count**: 566 → 566 (assertions added to existing tests, so the count does not move; zero deletions)
**Tests**: unit
**Gate**: full — `npm run typecheck && npm run lint && npm test`
**Commit**: `test(worktree): assert no guard refusal reports a leftover`
