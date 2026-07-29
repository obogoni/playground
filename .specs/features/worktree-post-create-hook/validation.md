# Worktree Post-Create Hook Validation

**Date**: 2026-07-29
**Spec**: `.specs/features/worktree-post-create-hook/spec.md`
**Diff range**: round 1 `c846eb0..cd95f5a`; **round 2 `cd95f5a..98034eb`** (full range `c846eb0..98034eb`) on `feature/worktree-post-create-hook`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the implementation
**Scope**: P1 slice only — WPC-01..16, WPC-20..24. WPC-17..19 are deferred P2 and are **not** treated as gaps.

> **CURRENT VERDICT (round 2, 2026-07-29): ✅ PASS.** The blocker is genuinely closed —
> independently re-probed against the new `hook-shell.ts`, every hung-command case now settles
> within 94–467 ms of the deadline (was 12969 ms / 21000 ms) and still reports
> `{code:-1, timedOut:true}`, with **no output loss** on the normal path (verified to 1 MB).
> All four round-1 findings are Closed. Two new **non-blocking** issues were found: the suite's
> pre-existing real-git flakiness got measurably worse, and three mutants survive on the new
> seam. See **[Round 2](#round-2-re-verification-2026-07-29)** at the end for the full evidence.
> The round-1 analysis below is retained verbatim as the historical record.

**Round-1 verdict (superseded): ⚠️ PASS WITH GAPS** — the decision logic is comprehensively covered and highly
discriminating (20/21 mutants killed), every gate is green at the expected baseline, and two of
the three author claims hold. One claim does **not** hold: the `runHookShell` timeout seam cannot
deliver WPC-05's contract for the exact case the timeout exists for. That is a real
implementation defect, found by direct empirical probe, and it is the one blocking item.

---

## Task Completion

| Commit    | Deliverable                                        | Status  | Notes |
| --------- | -------------------------------------------------- | ------- | ----- |
| `7732a89` | `repo-config.ts` + 10 unit tests                   | ✅ Done | - |
| `4859446` | `post-create-hook.ts` runner + shared types + 12 tests | ✅ Done | - |
| `bce57f4` | `withPostCreateHook` decorator + 10 tests          | ✅ Done | - |
| `dd3eeab` | `runHookShell` spawn seam + single wiring point    | ⚠️ Partial | Wiring correct; the timeout path does not return within the bound — see Gap 1 |
| `0ce6177` | `HookFailureNotice.tsx` + `.css`                    | ✅ Done | Renderer, convention-exempt from unit tests |
| `cd95f5a` | Both dialogs hold `hookFailure` state               | ✅ Done | Renderer, convention-exempt from unit tests |

Files claimed in scope, files actually touched — exact match, no scope creep:
`src/main/{repo-config,post-create-hook}.ts` + `.test.ts`, `src/main/index.ts`,
`src/shared/worktrees.ts`, `src/renderer/src/components/{HookFailureNotice.tsx,HookFailureNotice.css,NewWorktreeDialog.tsx,StartWorkDialog.tsx}`.
`worktree-manager.ts`, `workflow-ctx.ts`, `workspace-config.ts` and all of their tests are
**untouched** (verified: `git diff --name-only c846eb0..cd95f5a` returns 0 rows for them).

---

## Spec-Anchored Acceptance Criteria

Test files: `PCH` = `src/main/post-create-hook.test.ts`, `RC` = `src/main/repo-config.test.ts`.

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| **WPC-01** command runs through a shell with `cwd` = new worktree, before returning | shell invoked once, `cwd` === created worktree path | `PCH:173` — `expect(calls[0].cwd).toBe('M:\\src\\Code-feature-x')`; `PCH:116` — `expect(calls[0].cmd).toBe('SetupSkills.cmd')`; shell-hosting by inspection `index.ts:101` — `shell: true` | ✅ PASS |
| **WPC-02** exit 0 ⇒ `{ok:true, path, hook:{ok:true, command, code:0, output}}` | whole payload, field by field | `PCH:174-181` — `expect(result.ok).toBe(true)`, `expect(result.path).toBe('M:\\src\\Code-feature-x')`, `expect(result.hook).toEqual({ok:true, command:'SetupSkills.cmd', code:0, output:'junctions created'})` | ✅ PASS |
| **WPC-03** exit N ⇒ `{ok:true, path, hook:{ok:false, code:N, …}}` (payload half) | `ok` stays true, `path` preserved, `hook.ok` false, `hook.code` = N | `PCH:193-197` — `expect(result.ok).toBe(true)`, `expect(result.path).toBe('M:\\src\\Code-feature-x')`, `expect(result.error).toBeUndefined()`, `expect(result.hook?.ok).toBe(false)`, `expect(result.hook?.code).toBe(1)` | ✅ PASS |
| **WPC-03** worktree still exists on disk, no rollback (filesystem half) | directory present after a failed hook | **no test asserts on-disk state.** Structural evidence only: no removal call in the diff; `worktree-manager.test.ts:271` — `expect(existsSync(result.path!)).toBe(true)` proves `ok:true+path ⇒ dir exists` pre-feature | ⚠️ No direct evidence — structurally sound (see Claim 1) |
| **WPC-04** spawn failure ⇒ `hook:{ok:false, code:-1, …}` with error text in `output` | `ok:false`, `code:-1`, error text present | `PCH:62-64` — `expect(hook.ok).toBe(false)`, `expect(hook.code).toBe(-1)`, `expect(hook.output).toContain('spawn EACCES')`; real seam includes it: `index.ts:110` — `stderr: stderr + String(err)` | ✅ PASS (mapping tested, seam by inspection) |
| **WPC-05** not exited in 120000 ms ⇒ kill + `hook:{ok:false, code:-1, timedOut:true, output:<tail>}` | kill happens; result returned with exactly those values | Mapping: `PCH:72-75` — `expect(hook.ok).toBe(false)`, `expect(hook.code).toBe(-1)`, `expect(hook.timedOut).toBe(true)`, `expect(hook.output).toBe('Repo raiz : ...')`. Budget: `PCH:101-102` — `expect(calls[0].timeoutMs).toBe(120000)` + `expect(HOOK_TIMEOUT_MS).toBe(120000)`. Kill: `index.ts:103-117`, hand-verified | ❌ **GAP** — mapping and budget correct, but the seam does not return within the bound (Claim 3 / Gap 1) |
| **WPC-06** absent / unreadable / malformed / missing / blank / non-string ⇒ no command, **no `hook` property** | `null` from the reader; result has no `hook` key | Reader: `RC:46,52,58,64,69,72,78,96` — all `expect(repoPostCreateCommand(...)).toBeNull()`. Wrapper: `PCH:276-278` — `expect(calls).toHaveLength(0)`, `expect('hook' in result).toBe(false)`, `expect(result).toEqual({ok:true, path:'M:\\src\\Code-feature-x'})` | ✅ PASS |
| **WPC-07** malformed JSON ⇒ logged via `console.error`, silent fallback | exactly one `console.error`, message names the file; returns null | `RC:78-80` — `expect(repoPostCreateCommand(dir)).toBeNull()`, `expect(logged).toHaveLength(1)`, `expect(String(logged[0][0])).toContain(join(dir,'.app','config.json'))` | ✅ PASS |
| **WPC-08** no worktree ⇒ no command; `reuse`/`recreate` successes ⇒ command runs | shell never called and no `hook` key on every no-worktree outcome; called on reuse/recreate | No-run: `PCH:209-211` (branch-exists) — `expect(calls).toHaveLength(0)`, `expect('hook' in result).toBe(false)`, `expect(result.conflict).toBe('branch-exists')`; `PCH:223-224` (create failed); `PCH:236-237` (ok but no path). Run: `PCH:249-250` — `expect(calls[0].cwd).toBe('M:\\src\\Code-feature-reuse')`, `expect(result.hook?.ok).toBe(true)`; `PCH:262-263` (recreate). Each enumerated outcome is proven `ok:false` upstream: `worktree-manager.test.ts:307` (base unknown), `:315` (empty template), `:295` (target exists), `:396` (branch live elsewhere), `:519,:529` (blocked refresh) | ✅ PASS |
| **WPC-09** env = inherited `process.env` + the three `PLAYGROUND_*` vars | each var equals the corresponding context value; inheritance preserved | `PCH:83-85` — `expect(calls[0].env.PLAYGROUND_WORKTREE_PATH).toBe('M:\\triade\\source\\Code-feature-x')`, `…PLAYGROUND_REPO_PATH).toBe('M:\\triade\\source\\Code')`, `…PLAYGROUND_BRANCH).toBe('feature/x')`; `PCH:93` — `expect(calls[0].env.PATH).toBe(process.env.PATH)` | ✅ PASS (all four killed as mutants M5/M5b/M5c/M5d) |
| **WPC-10** all three create paths run the hook; no caller can opt out | both consumers bound to the wrapper; no bare `createWorktree` call site | `index.ts:231` — `withPostCreateHook(createWorktree, {readCommand: repoPostCreateCommand, shell: runHookShell})`; `index.ts:238` — IPC handler calls `createWorktreeWithHook(...)`; `index.ts:348` — `create: createWorktreeWithHook`. Exhaustive grep: the only production reference to bare `createWorktree` in `src/` is the wrapper argument itself | ✅ PASS (structural — see Claim 2; no automated regression guard) |
| **WPC-11** output > 4000 chars ⇒ **last** 4000 | length exactly 4000, tail retained | `PCH:124-125` — `expect(hook.output).toHaveLength(HOOK_OUTPUT_MAX_CHARS)`, `expect(hook.output.endsWith('TAIL')).toBe(true)` | ⚠️ **Partial** — "last, not first" is pinned (mutant M3 killed); the **value 4000** is not: the assertion references the constant, so changing it to 2000 keeps the suite green (mutant M7 SURVIVED) |
| **WPC-12** New Worktree dialog stays open showing path + command + code/timeout + output | four elements rendered, dialog not closed | `NewWorktreeDialog.tsx:105-108` — `if (result.hook && !result.hook.ok) { setHookFailure({path: result.path, hook: result.hook}); setBusy(false); return }` (no `onCreated`/`onClose` ⇒ stays open); `HookFailureNotice.tsx:37` path, `:38` command, `:39-41` `hook.timedOut ? 'timed out and was stopped' : \`exit code ${hook.code}\``, `:42` `hook.output !== '' && <pre>{hook.output}</pre>` | ✅ PASS (inspection; renderer is unit-test-exempt per TESTING.md — no automated evidence) |
| **WPC-13** Start Work dialog shows the same four elements | as WPC-12 | `StartWorkDialog.tsx:117-123` (identical branch) + same `HookFailureNotice` lines | ✅ PASS (inspection) |
| **WPC-14** an action dismisses and proceeds with tree refresh + select | the action calls the happy path's `onCreated(path)` | `NewWorktreeDialog.tsx:210` / `StartWorkDialog.tsx:241` — `onProceed={() => onCreated(hookFailure.path)}`; `HookFailureNotice.tsx:47-49` "Continue" button; `App.tsx:176-180` — `worktreeCreated` ⇒ `refreshAndSelect(worktreePath)` | ✅ PASS (inspection) |
| **WPC-15** `hook.ok === true` OR no `hook` ⇒ today's behavior exactly | the advisory branch is entered only on `hook && !hook.ok` | `NewWorktreeDialog.tsx:105` / `StartWorkDialog.tsx:120` — guard `result.hook && !result.hook.ok`, else `onCreated(result.path)` at `:110` / `:126` | ✅ PASS (inspection) |
| **WPC-16** create button cannot re-submit the same create | button not reachable while the notice is up | `NewWorktreeDialog.tsx:206-235` — the `hookFailure ?` branch replaces the whole `<footer>` that holds the `Create worktree` button (`:225-233`); same structure in `StartWorkDialog.tsx:234-…` | ✅ PASS (inspection — stronger than "disabled": the button is not rendered) |
| **WPC-20** spaced worktree path still runs correctly | path travels as `cwd`, never in the command string | `PCH:115-116` — `expect(calls[0].cwd).toBe('M:\\my repos\\Code feature x')`, `expect(calls[0].cmd).toBe('SetupSkills.cmd')` | ✅ PASS |
| **WPC-21** hook key and template keys are mutually invisible | reader returns the command; `workspaceTemplates` returns only the two template keys | `RC:88-92` — `expect(repoPostCreateCommand(dir)).toBe('SetupSkills.cmd')`, `expect(workspaceTemplates(dir)).toEqual({branchTemplate:'task/{id}', worktreeTemplate:'{id}'})` (exact `toEqual` proves `postCreateCommand` is not leaked) | ✅ PASS |
| **WPC-22** concurrent creates independent, own cwd/output, no blocking | each result carries its own command and its own output | `PCH:320-323` — `expect(slow.hook?.command).toBe('Slow.cmd')`, `expect(slow.hook?.output).toBe('ran in M:\\src\\Code-slow')`, `expect(fast.hook?.command).toBe('Fast.cmd')`, `expect(fast.hook?.output).toBe('ran in M:\\src\\Code-fast')` (interleaved via 20 ms vs 1 ms delays, `Promise.all`) | ✅ PASS |
| **WPC-23** no output ⇒ `''`, never `undefined` | strict `''` | `PCH:141` — `expect(hook.output).toBe('')` | ✅ PASS |
| **WPC-24** exit 0 with nothing done ⇒ success | `ok:true` | `PCH:149` — `expect(hook.ok).toBe(true)` for command `'rem no-op'` | ✅ PASS |

**Payload / conjunction rule** — every named field is asserted at value level, not merely
returned:

| Field | Value-level assertions |
| ----- | ---------------------- |
| `hook.ok` | `PCH:40` true, `:52` false, `:62` false, `:73` false, `:149` true, `:196` false, `:250` true, `:263` true, `:176` (via `toEqual`) |
| `hook.command` | `PCH:42` `toBe('SetupSkills.cmd')`, `:176` (`toEqual`), `:320`/`:322` per-instance |
| `hook.code` | `PCH:41` `0`, `:53` `1`, `:63` `-1`, `:74` `-1`, `:197` `1`, `:176` (`toEqual`) |
| `hook.output` | `PCH:43`, `:54`, `:64`, `:75`, `:124`, `:133`, `:141`, `:176` (`toEqual`) |
| `hook.timedOut` | `PCH:44` `toBeUndefined()` on success, `:74` `toBe(true)` on timeout |
| create `ok` | `PCH:174`, `:193`, plus `ok:false` no-run cases `:211`, `:224`, `:237` |
| create `path` | `PCH:175`, `:194`, `:278` (`toEqual` of the whole result) |
| create `hook` (presence) | `PCH:176` full `toEqual`; absence `'hook' in result === false` at `:210`, `:224`, `:237`, `:277` |

**Status**: 20 of 21 in-scope ACs matched their spec-defined outcome. **1 ❌ GAP (WPC-05)**,
**1 ⚠️ partial (WPC-11 bound value)**, **1 ⚠️ no direct evidence (WPC-03 filesystem half)**.
No unclaimed tests: all 32 new tests map to a WPC id.

---

## The Three Scrutinised Author Claims

### Claim 1 — WPC-03's filesystem half is guaranteed "by construction"

**Author's claim**: the worktree still exists on disk because no deletion code exists in the
feature.

**Independent verdict: HOLDS, but it is a structural argument, not evidence.**

Searched the entire diff for `removeWorktree|rmSync|rm -rf|worktree remove|unlink|rmdir|rimraf`.
The only hits are (a) pre-existing, unmodified context lines in `index.ts` (the
`worktrees:remove` handler and `ctxDeps.worktree.remove`), and (b) `rmSync` inside
`repo-config.test.ts`'s own `afterEach` temp-dir teardown. `withPostCreateHook` is a pure
decorator: on the failure path it returns `{ ...result, hook }` (`post-create-hook.ts:138`) and
performs no filesystem operation whatsoever. It is also the **last** thing to run — the IPC
handler returns the result verbatim (`index.ts:236-239`), and `ctx.worktree.create` is a
pass-through inside `instrument`, which returns the resolved value unchanged and reports
`ok: true` (`workflow-ctx.ts:227-229`); neither inspects `hook` nor cleans up. Independent
supporting evidence that `ok:true + path` implies an existing directory:
`worktree-manager.test.ts:271` — `expect(existsSync(result.path!)).toBe(true)`.

Two honest caveats: (1) no test in this feature asserts on-disk state after a hook failure, so
the spec's own "Independent Test" (temp repo, `exit /b 1`, worktree still present) has **not**
been executed as an automated test — the guarantee rests on reading the code; (2) the hook
command itself runs *inside* the worktree and could delete it, which no app-level construction
can prevent (correctly out of the app's contract).

### Claim 2 — WPC-10's "no caller can opt out"

**Independent verdict: HOLDS.**

`grep -rn "createWorktree" src/` over all of `src/` yields exactly four production references:
the import (`index.ts:34`), the wrapper construction (`index.ts:231`), and the two consumers —
`index.ts:238` (the `worktrees:create` IPC handler, which serves both New Worktree and Start
Work) and `index.ts:348` (`ctxDeps.worktree.create`). Every other hit is inside
`worktree-manager.test.ts` (testing the inner function directly, which is correct) or a comment.
There is **no** second `CtxDeps` construction in production — `grep -rn "CtxDeps" src/` shows
`index.ts:344` as the only one; the others are type declarations or test fakes. `workflow-ctx.ts`
threads `deps.worktree.create` straight through (`:250-257`) with no fallback default. And
`git diff --name-only c846eb0..cd95f5a` confirms `worktree-manager.ts`, `worktree-manager.test.ts`,
`workflow-ctx.ts`, `workflow-ctx.test.ts` are **genuinely unmodified** — the decorator design
delivered exactly what it promised.

One durability caveat (not an AC violation): the guarantee is enforced only by code review.
Nothing fails if a future edit re-points `ctxDeps.worktree.create` at bare `createWorktree`,
because `index.ts` wiring carries no test by project convention.

### Claim 3 — WPC-05's kill "delivers the spec's contract"

**Independent verdict: DOES NOT HOLD.** The mapping is right; the liveness is not.

I probed the exact `runHookShell` shape (`spawn` + `shell:true` + `timeout` + `killSignal:'SIGTERM'`
+ `close(code, signal)` handling) with real processes on this machine.

What works, confirmed empirically:

- On Windows the timeout kill **is** observable as a signal: `exit code=null signal=SIGTERM at 1665ms`.
  So `signal !== null` is a valid timed-out marker and the mapping to `{code:-1, timedOut:true}`
  is correct — `ok` is then `-1 === 0` ⇒ `false`.
- **No path can report `ok:true` for a killed command.** Killed ⇒ `signal` non-null ⇒ `code`
  forced to `-1` ⇒ `ok:false`. A clean `close(0, null)` only happens when the command genuinely
  finished successfully. Confirmed: `exit /b 3` ⇒ `code=3 ok=false`; `echo hello` ⇒ `code=0 ok=true`.

What is broken:

- The promise resolves on **`close`**, which fires only after every stdio stream reaches EOF.
  `spawn(cmd, {shell:true})` launches `cmd.exe /d /s /c "<cmd>"`, and the timeout kills **only
  cmd.exe**. The real command process is its child, survives `TerminateProcess`, and keeps the
  inherited stdout/stderr pipe write-handles open — so `close` does **not** fire at the timeout.
  Probe A (`ping -n 12 127.0.0.1`, `timeout: 1500`): `exit` at **1665 ms**, `close` only at
  **12969 ms** — i.e. when the surviving child finished on its own, ~11 s after the deadline.
  Probe B (same plus a `start /b` grandchild): `exit` at 1935 ms, `close` at **21000 ms**.
- Consequence for WPC-05: the spec requires the system to "terminate the spawned shell process
  **and return** `hook: {ok:false, code:-1, timedOut:true, output:<tail>}`". The termination
  happens at 120 s; the **return does not**. For the very case the timeout exists for — a
  genuinely hung script (`pause`, a prompt waiting on stdin, an infinite loop) — the surviving
  child never releases the pipe, `close` never fires, `runHookShell`'s promise never settles, so
  `createWorktreeWithHook` never resolves. The `worktrees:create` IPC call never returns and the
  dialog is stuck on `busy` indefinitely; a workflow run's `worktree.create` step hangs forever.
  This is strictly worse than the documented Out-of-Scope item, which concedes only that "a
  detached grandchild may survive" — it does not concede that the result is never returned.
- The code comment at `index.ts:90-94` therefore describes a stronger guarantee than the code
  delivers.
- Minor, same seam: `signal !== null` is the *only* `timedOut` marker, so any other signal-kill
  (app teardown, external `taskkill`) is mislabelled `timedOut: true`.

**Fix direction** (one line, no new dependency): resolve on the **`exit`** event instead of
`close` (optionally after a short drain), since `exit` fired correctly at ~1.7 s in both probes.
A real process-tree kill remains legitimately out of scope.

---

## Discrimination Sensor

Each mutation was applied to the real file one at a time, the covering tests were run
(`npx vitest run --maxWorkers=2 src/main/post-create-hook.test.ts src/main/repo-config.test.ts`,
32 tests), then the file was hard-reverted with `git checkout --` and byte-compared against the
original (all 21 reported `restored`). Final `git status --porcelain` was clean.

| #    | File | Mutation | Killed? |
| ---- | ---- | -------- | ------- |
| M1   | `post-create-hook.ts:63` | `ok: result.code === 0` → `ok: true` | ✅ Killed (4 failed) |
| M2   | `post-create-hook.ts:130` | guard `!result.ok \|\| typeof result.path !== 'string'` → `!result.ok` | ✅ Killed (1 failed) |
| M3   | `post-create-hook.ts:80` | `combined.slice(-MAX)` → `combined.slice(0, MAX)` (head instead of tail) | ✅ Killed |
| M4   | `post-create-hook.ts:4` | `HOOK_TIMEOUT_MS = 120000` → `60000` | ✅ Killed |
| M5   | `post-create-hook.ts:58` | drop `PLAYGROUND_BRANCH` | ✅ Killed |
| M5b  | `post-create-hook.ts:56` | drop `PLAYGROUND_WORKTREE_PATH` | ✅ Killed |
| M5c  | `post-create-hook.ts:57` | drop `PLAYGROUND_REPO_PATH` | ✅ Killed |
| M5d  | `post-create-hook.ts:55` | drop `...process.env` (no inheritance) | ✅ Killed |
| M6   | `post-create-hook.ts:138` | `return { ...result, hook }` → `return result` | ✅ Killed (5 failed) |
| M7   | `post-create-hook.ts:7` | `HOOK_OUTPUT_MAX_CHARS = 4000` → `2000` | ❌ **SURVIVED** (32/32 still passed) |
| M8   | `post-create-hook.ts:79` | `combinedTail` drops `stderr` (stdout only) | ✅ Killed (3 failed) |
| M9   | `post-create-hook.ts:67` | never propagate `timedOut` | ✅ Killed |
| M10  | `post-create-hook.ts:53` | `cwd: ctx.worktreePath` → `cwd: ctx.repoPath` | ✅ Killed (5 failed) |
| M11  | `post-create-hook.ts:52` | forward `''` instead of `command` to the shell | ✅ Killed |
| M12  | `post-create-hook.ts:132` | no-command repos get a `hook` key anyway | ✅ Killed |
| M13  | `repo-config.ts:32` | malformed-JSON catch returns `''` instead of `null` | ✅ Killed |
| M14  | `repo-config.ts:31` | remove the `console.error` on malformed JSON | ✅ Killed |
| M15  | `repo-config.ts:38` | `stringOrNull` drops the blank check | ✅ Killed |
| M16  | `repo-config.ts:38` | `stringOrNull` drops the `typeof === 'string'` check | ✅ Killed |
| M17  | `repo-config.ts:38` | return the command untrimmed | ✅ Killed |
| M18  | `repo-config.ts:20` | read `<repo>/config.json` instead of `<repo>/.app/config.json` | ✅ Killed (4 failed) |

**Sensor depth**: extended (21 mutations, well beyond the 1–3 default; every branch of both new
modules covered).
**Result**: **20/21 killed** — ❌ one survivor.

**Survivor analysis (M7)** — `post-create-hook.test.ts:124` asserts
`expect(hook.output).toHaveLength(HOOK_OUTPUT_MAX_CHARS)`, i.e. it compares the output against
the very constant under test, so any bound value passes. WPC-11 pins **4000** precisely, so the
spec-defined value is unguarded. Contrast the timeout test, which does it right:
`PCH:101-102` asserts the literal `120000` *and* the constant — which is exactly why M4 was
killed and M7 was not. Fix: add `expect(HOOK_OUTPUT_MAX_CHARS).toBe(4000)` (or assert
`toHaveLength(4000)` with the literal).

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| No features beyond what was asked | ✅ P1 slice only; WPC-17..19 correctly absent |
| No abstractions for single-use code | ✅ the one abstraction (the decorator) is the chosen design option D |
| No unnecessary flexibility | ✅ timeout/bound are fixed constants per spec, not config knobs |
| Only touched files required for task | ✅ 10 files, exactly the design's module table |
| Didn't improve unrelated code | ✅ `worktree-manager.ts`, `workflow-ctx.ts`, `workspace-config.ts` untouched |
| Matches existing patterns/style | ✅ `runHookShell` mirrors `runShell`; `repo-config.ts` mirrors `workspace-config.ts`; hand-rolled fakes, no `vi.mock`; `HookFailureNotice` mirrors `BranchExistsChoice`'s footer geometry |
| Would a senior engineer approve? | ⚠️ Yes for the logic and tests; the `close`-vs-`exit` timeout defect (Gap 1) would be a review blocker |
| Tests map to ACs and are non-shallow | ✅ every one of the 32 tests maps to a WPC id; assertions are value-level |
| Spec-anchored outcome check | ⚠️ 20/21; WPC-11's bound value is self-referential |
| Per-layer Coverage Expectation met | ✅ main-process logic unit-tested 1:1; renderer + thin shell hand-verified per TESTING.md |
| No unclaimed tests | ✅ |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` — co-located `*.test.ts`, `mkdtempSync` temp dirs with `rmSync` teardown, injected hand-rolled fakes, no mocking library |

Positive notes worth recording: WPC-16 is implemented more strongly than specified (the button is
not rendered at all rather than merely disabled); `repo-config.ts` separates the read failure
(`catch → null`, silent) from the parse failure (`catch → console.error + null`) so WPC-06 and
WPC-07 cannot be conflated; and `'hook' in result` (rather than `result.hook === undefined`) is
the right assertion for WPC-06's "no `hook` property".

---

## Edge Cases

- [x] **WPC-20** spaced path — `PCH:115-116`, cwd-only, never interpolated.
- [x] **WPC-21** key independence — `RC:88-92`, exact `toEqual` both directions.
- [x] **WPC-22** concurrency — `PCH:297-324`, genuinely interleaved (`Promise.all`, 20 ms vs 1 ms).
- [x] **WPC-23** silent command ⇒ `''` — `PCH:141`.
- [x] **WPC-24** exit 0 with nothing done ⇒ success — `PCH:149`.
- [ ] **Not an enumerated edge case, but found**: a hung command's result is never returned
      (Gap 1). Also unhandled: dismissing the notice via the dialog **backdrop**
      (`NewWorktreeDialog.tsx:128` — `onClick={onClose}`) closes without `refreshAndSelect`, so
      the created worktree does not appear in the tree until the next refresh. WPC-14 only
      requires that *an* action proceeds, and "Continue" does, so this is a UX nit, not a breach.

---

## Gate Check

- **Gate**: Full — `npm run typecheck && npm run lint && npx vitest run --maxWorkers=2`
  (`--maxWorkers=2` per the known local flakiness of the real-git suites under default worker
  count; identical test set, no assertion, skip, or timeout altered).

| Gate | Command | Result |
| ---- | ------- | ------ |
| Typecheck | `npm run typecheck` (node + web) | ✅ exit 0, no diagnostics |
| Lint | `npm run lint` | ✅ exit 0 — **0 errors**, 18 prettier warnings, all pre-existing and all in `scripts/` (`fixtures/implement-ticket/workflow.ts`, `smoke-agent-config.mjs`, `smoke-agents.mjs`). Re-running eslint over only the 9 feature files produces **zero** output. |
| Unit | `npx vitest run --maxWorkers=2` | ✅ **521 passed / 521 (38 files)**, 0 failed, 0 skipped, 124.49 s |

- **Test count before feature**: 489 / 36 files (design baseline)
- **Test count after feature**: **521 / 38 files**
- **Delta**: **+32** (`post-create-hook.test.ts` 22, `repo-config.test.ts` 10), **zero deletions,
  zero skips**
- **Failures**: none. The known load-related real-git flakiness in `tree.test.ts` /
  `worktree-manager.test.ts` did **not** occur at `--maxWorkers=2`; the run was green on the
  first attempt, so no re-run and no load-vs-regression adjudication was needed.
- **Working tree after all mutation work**: `git status --porcelain` clean; the only file this
  validation created is this report.

---

## Fix Plans

### Fix 1 — WPC-05: return the timeout result within the time bound (Blocker)

- **Root cause**: `runHookShell` resolves on `close`, which waits for stdio EOF. `spawn`'s
  `timeout` kills only `cmd.exe`; its surviving child holds the inherited pipes open, so `close`
  is deferred until that child exits on its own — never, for a genuinely hung script. Proven by
  probe: `exit` at 1665 ms vs `close` at 12969 ms on `ping -n 12` with a 1500 ms timeout.
- **Fix task**: in `src/main/index.ts:111`, resolve on the **`exit`** event (`(code, signal)`,
  same mapping) instead of `close`, so the result is returned as soon as the shell is killed;
  keep whatever output arrived. Update the `:90-94` comment to state that a surviving child may
  keep running *and* that its later output is not captured.
- **Verify**: with a repo whose `postCreateCommand` blocks forever (e.g. `pause`), a create
  returns `hook: {ok:false, code:-1, timedOut:true}` at the timeout and the dialog leaves `busy`.
  A short-lived script must still report its real exit code and full output (regression check on
  `echo`/`exit /b 3`).
- **Priority**: **Blocker** — WPC-05 is the only AC not delivered, and the failure mode is a
  permanently hung dialog / workflow step.

### Fix 2 — WPC-11: pin the 4000-char bound (Major)

- **Root cause**: the only length assertion references `HOOK_OUTPUT_MAX_CHARS` itself, so the
  spec-defined value is untested (mutant M7 survived).
- **Fix task**: add `expect(HOOK_OUTPUT_MAX_CHARS).toBe(4000)` in
  `src/main/post-create-hook.test.ts` alongside the existing tail test (mirroring the
  `HOOK_TIMEOUT_MS` test at `:102`).
- **Verify**: re-run mutant M7 (`4000` → `2000`); it must now fail.
- **Priority**: **Major** (test-strength gap, not a behavior defect).

### Fix 3 — WPC-03: assert the worktree survives a failed hook (Minor)

- **Root cause**: the filesystem half of WPC-03 rests entirely on code reading; the spec's own
  Independent Test is not automated.
- **Fix task**: one real-temp-repo test (the `worktree-manager.test.ts` pattern) that creates a
  worktree through `withPostCreateHook(createWorktree, …)` with a fake shell returning `code: 1`,
  then asserts `existsSync(result.path!) === true` alongside `result.ok === true`.
- **Priority**: **Minor** — closes the last evidence-or-zero hole in the P1 slice.

### Fix 4 — backdrop dismissal skips the tree refresh (Cosmetic)

- **Root cause**: the backdrop's `onClose` is still live while the notice is shown, so the new
  worktree is not selected/refreshed if the user clicks outside.
- **Fix task**: while `hookFailure` is set, route the backdrop/`Escape` dismissal through
  `onCreated(hookFailure.path)` in both dialogs.
- **Priority**: **Cosmetic**.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| WPC-01 | Tasks | ✅ Verified |
| WPC-02 | Tasks | ✅ Verified |
| WPC-03 | Tasks | ⚠️ Verified (payload) / no automated filesystem evidence — Fix 3 |
| WPC-04 | Tasks | ✅ Verified |
| WPC-05 | Tasks | ❌ Needs Fix — Fix 1 |
| WPC-06 | Tasks | ✅ Verified |
| WPC-07 | Tasks | ✅ Verified |
| WPC-08 | Tasks | ✅ Verified |
| WPC-09 | Tasks | ✅ Verified |
| WPC-10 | Tasks | ✅ Verified (structural) |
| WPC-11 | Tasks | ⚠️ Needs Fix (bound value unguarded) — Fix 2 |
| WPC-12 | Tasks | ✅ Verified by inspection (renderer convention) |
| WPC-13 | Tasks | ✅ Verified by inspection |
| WPC-14 | Tasks | ✅ Verified by inspection |
| WPC-15 | Tasks | ✅ Verified by inspection |
| WPC-16 | Tasks | ✅ Verified by inspection |
| WPC-17..19 | — | ⏭️ Deferred to P2 (out of this validation's scope) |
| WPC-20 | Tasks | ✅ Verified |
| WPC-21 | Tasks | ✅ Verified |
| WPC-22 | Tasks | ✅ Verified |
| WPC-23 | Tasks | ✅ Verified |
| WPC-24 | Tasks | ✅ Verified |

---

## Interactive UAT

Not performed by this Verifier — WPC-12..16 require a live Electron session with a seeded
workspace (`npm run dev` + a repo declaring a failing `postCreateCommand`). The renderer wiring
was verified by code inspection instead (see the AC table). The spec's Success Criteria items
(real junctions for `m:\triade\source\Code`, workflow-created worktree, failing-command dialog)
remain **unconfirmed on real hardware** and should be exercised by the user after Fix 1.

---

## Summary

**Overall**: ⚠️ Issues — not ready to merge until Fix 1 lands.

**Spec-anchored check**: 20/21 in-scope ACs matched their spec-defined outcome (1 gap: WPC-05;
1 partial: WPC-11; 1 without direct filesystem evidence: WPC-03)
**Sensor**: 20/21 mutations killed (survivor: `HOOK_OUTPUT_MAX_CHARS` value)
**Gate**: typecheck ✅ · lint ✅ 0 errors · 521/521 tests passed, 38 files, 0 skipped

**What works**: the decision logic is genuinely well covered — every field of
`PostCreateHookResult` and of the create result is asserted at value level; the run-iff-created
guard closes all six WPC-08 no-worktree outcomes through a single value test whose premises are
independently proven by the untouched `worktree-manager` suite; the decorator design delivered
its central promise (`worktree-manager.ts` and `workflow-ctx.ts` are byte-identical, and no call
site can reach bare `createWorktree`); `repo-config.ts` separates silent read failure from logged
parse failure exactly as WPC-06/07 require; the dialogs' advisory-not-error treatment matches the
"keep the worktree" decision, and WPC-16 is enforced structurally by not rendering the button.

**Issues found**:
1. WPC-05 — a hung hook's result is never returned (`close` vs `exit`); the dialog/workflow step
   hangs indefinitely. Fix 1.
2. WPC-11 — the 4000-char bound is asserted against its own constant; mutating it to 2000 keeps
   the suite green. Fix 2.
3. WPC-03 — the "worktree still exists on disk" half has no automated evidence. Fix 3.
4. Backdrop dismissal of the notice skips the tree refresh. Fix 4.

**Next steps**: apply Fix 1 (blocker) and Fix 2, optionally Fix 3/4, then re-run the full gate
plus mutant M7 and re-verify. After that, hand-run the spec's Success Criteria on a real repo.

---

# Round 2 Re-verification (2026-07-29)

**Diff range**: `cd95f5a..98034eb` — 3 commits, 6 files (+261/−42)
**Verifier**: same independent sub-agent, still read-only over the implementation
**Method**: fix claims were **not** taken at face value. The new `hook-shell.ts` was re-probed
with real processes using the round-1 methodology, the sensor was re-run on the changed code, and
every reported mutant kill was checked for reproducibility.

**Verdict: ✅ PASS** — all four round-1 findings Closed. Two new non-blocking issues found.

## Round-1 findings — status

| # | Finding | Status | Evidence |
| - | ------- | ------ | -------- |
| 1 | **Blocker** — WPC-05: hung hook's result never returned (`close`-only settle) | ✅ **Closed** | Re-probed the real module: every hung case settles 94–467 ms past the deadline with `{code:-1, timedOut:true}`; no truncation on the normal path. Tables below. |
| 2 | Major — WPC-11's 4000-char bound unguarded | ✅ **Closed** | `post-create-hook.test.ts:131-135` — `expect(HOOK_OUTPUT_MAX_CHARS).toBe(4000)` + `expect(hook.output).toHaveLength(4000)` (literal). Mutant **R1 now KILLED** (survived in round 1). |
| 3 | Minor — WPC-03 filesystem half had no automated evidence | ✅ **Closed** | New `describe('withPostCreateHook over real git')`, `post-create-hook.test.ts:389-391` — `expect(existsSync(result.path as string)).toBe(true)` + `expect(existsSync(join(result.path as string,'a.txt'))).toBe(true)` after `declareCommand('exit 1')`, alongside `expect(result.ok).toBe(true)`, `hook.ok === false`, `hook.code === 1`. Assertion liveness confirmed — mutants R13/R14 killed. |
| 4 | Cosmetic — backdrop dismissal skipped the tree refresh | ✅ **Closed** | `NewWorktreeDialog.tsx:131` / `StartWorkDialog.tsx:148` — `onClick={hookFailure ? () => onCreated(hookFailure.path) : onClose}`. The panel still stops propagation, so clicks inside the dialog are unaffected. |

## Finding 1 — independent re-probe of the new `hook-shell.ts`

The real module was transpiled unmodified (`npx esbuild src/main/hook-shell.ts`) and driven
directly, so these numbers come from the shipped code, not a replica.

| Case | Command | Round 1 | Round 2 | Result |
| ---- | ------- | ------- | ------- | ------ |
| stdin-blocked | `pause` | would hang | settled **+152 ms** past deadline, `code=-1 timedOut=true` | ✅ |
| infinite loop (shell-internal) | `:top` / `goto top` | would hang | settled **+94 ms**, `code=-1 timedOut=true` | ✅ |
| child process holds pipes | `ping -n 10 127.0.0.1` | `close` at **12969 ms** | settled **+119 ms**, `code=-1 timedOut=true` | ✅ |
| detached grandchild | `start /b ping … & ping …` | `close` at **21000 ms** | settled **+467 ms**, `code=-1 timedOut=true` | ✅ |
| silent pipe holder | `start /b ping … >nul & ping …` | would hang | settled **+346 ms**, `code=-1 timedOut=true` | ✅ |
| exit 0 with surviving grandchild | `start /b ping -n 10 …` | hung ~9 s | settled at **1360 ms** via the grace path, `code=0 ok=true` | ✅ correct (the exit code is the whole contract, WPC-24) |

Settle-race analysis of `settled` / `graceTimer` / `unref()`:

- **`exit` without `close`** — the grandchild case. The still-open inherited pipes are active
  libuv handles, so the loop stays alive and the grace timer fires. ✅ Confirmed by all five hung
  cases above.
- **`close` without `exit`** — possible on a spawn failure; `close`'s own `(code, signal)` feed the
  same `outcome()`, so the mapping is identical. The `error` handler also settles. ✅
- **Double settle** — guarded by `settled`; and even unguarded a second `resolve()` is a no-op
  (mutant R6, an equivalent mutant).
- **Timer leak** — `settle()` clears the timer. If `close` won *before* `exit` armed it, the `exit`
  handler still arms one that later fires into an already-settled `settle()`. Harmless, and it is
  `unref()`'d so it cannot delay process exit. Nit only: the `exit` handler does not check
  `settled` before arming.
- **⚠️ Latent fragility in `graceTimer.unref?.()`** — an unref'd timer cannot by itself keep the
  event loop alive, so the grace path's "guaranteed progress" holds only because *some other*
  handle exists (the held pipes, or the `close` event). Demonstrated concretely: a scratch variant
  with the `close` handler removed **exits with the promise unsettled** — `node` returns 0 and
  nothing ever resolves. This is **not** a live defect (the shipped code always has `close`, and an
  Electron main process always has active handles), but the doc comment at `hook-shell.ts:27-31`
  overstates how independent the two paths are, and mutant R5 shows no test would catch the
  removal.
- **Is 250 ms enough?** Yes — see the completeness table. `close` wins on every normal path, so the
  grace window is never actually consumed there.

## Finding 2 (new question) — output completeness on the normal path: **no regression**

Settling on `exit`+250 ms could have truncated a command still flushing output. Tested directly
against the real module; nothing is lost:

| Case | Expected | Captured | Result |
| ---- | -------- | -------- | ------ |
| `echo hello` | 7 B | 7 B | COMPLETE |
| 1 000 lines | 1 000 lines | 1 000 lines | COMPLETE |
| 20 000 lines | 20 000 lines | 20 000 lines | COMPLETE |
| 200 000 lines | 400 000 B | 400 000 B | COMPLETE |
| 1 MB single burst then `process.exit(0)` | 1 048 576 B | **1 048 576 B** | COMPLETE |
| 2 s slow trickle (20 ticks, 100 ms apart) | 20 ticks | 20 ticks | COMPLETE |
| stderr-only failure | `boom` on stderr, code 1 | captured, code 1 | COMPLETE |

Why it is safe: a child cannot exit until its writes are accepted, so at `exit` at most a pipe
buffer (~64 KB) remains, which drains far inside 250 ms — and `close` normally fires ~1 ms after
`exit` and wins the race anyway. Output produced by a **surviving grandchild after** the shell is
killed is discarded; that is the documented and correct trade-off.

## Round-2 Discrimination Sensor

One mutation at a time on the real files, covering tests run
(`npx vitest run --maxWorkers=2 src/main/hook-shell.test.ts src/main/post-create-hook.test.ts`,
32 tests), then `git checkout --` plus an **md5 comparison** against the pre-mutation hash — all 14
reported `restored`.

| #   | File | Mutation | Killed? |
| --- | ---- | -------- | ------- |
| R1  | `post-create-hook.ts:7` | `HOOK_OUTPUT_MAX_CHARS` 4000 → 2000 (round-1 survivor) | ✅ **Killed** (was SURVIVED) |
| R2  | `hook-shell.ts:11` | `HOOK_FLUSH_GRACE_MS` 250 → 25000 | ✅ Killed (2 failed) |
| R3  | `hook-shell.ts:11` | `HOOK_FLUSH_GRACE_MS` 250 → 0 | ❌ **SURVIVED** |
| R4  | `hook-shell.ts:63-67` | remove the `exit` handler (regression to round-1 behaviour) | ✅ Killed (2 failed) |
| R5  | `hook-shell.ts:62` | remove the `close` handler | ❌ **SURVIVED** |
| R6  | `hook-shell.ts:49-50` | remove the `settled` guard | ❌ SURVIVED — *equivalent mutant* |
| R7  | `hook-shell.ts:55` | invert `signal !== null` → `signal === null` | ✅ Killed (6 failed) |
| R8  | `hook-shell.ts:56` | `timedOut: true` → `timedOut: false` | ✅ Killed (2 failed) |
| R9  | `hook-shell.ts:57` | `code: code ?? -1` → `code: 0` | ✅ Killed (2 failed) |
| R10 | `hook-shell.ts:51` | drop `clearTimeout(graceTimer)` | ❌ SURVIVED — *equivalent mutant* (see correction) |
| R11 | `hook-shell.ts:60` | stop capturing `stderr` in the seam | ❌ **SURVIVED** |
| R12 | `hook-shell.ts:40` | drop the `timeout: timeoutMs` spawn option | ✅ Killed (2 failed) |
| R13 | `post-create-hook.test.ts:389-390` | assertion liveness: failing-hook worktree `existsSync` → `false` | ✅ Killed |
| R14 | `post-create-hook.test.ts:377` | assertion liveness: marker file `existsSync` → `false` | ✅ Killed |

**Result: 9/14 killed, 5 survived — 2 of them equivalent mutants**, so **3 real gaps** (R3+R5 are
one underlying gap, R11 the other). Round-1's survivor is dead.

**R10 correction — a reported kill that did not reproduce.** The driver first recorded R10 as
KILLED (`1 failed`). Re-running it twice — once on `hook-shell.test.ts` alone (7/7 passed) and once
on both files (32/32 passed) — shows it does **not** reproduce: that failure was suite flakiness,
not a kill. R10 is reclassified **SURVIVED / equivalent** (a leaked `unref()`'d timer has no
observable effect). Every other kill is semantically explicable from the tests it broke, so no
other kill is suspect. This was also the first direct evidence of Finding 6.

**Surviving-mutant analysis:**

- **R3 + R5 (one gap)** — nothing pins *which* condition settles the seam. The only success-path
  output assertion in `hook-shell.test.ts` is `expect(result.stdout).toContain('hello-from-hook')`
  (7 bytes), so neither shortening the grace window to 0 nor deleting the `close` handler is
  detectable. My probes prove the shipped configuration is correct, but a future edit to the settle
  condition is unguarded. Fix: one test asserting **complete** output from a large/slow producer
  (200 k lines, or a 2 s trickle) — that kills both.
- **R11** — the real seam's `stderr` capture is asserted nowhere: `hook-shell.test.ts` has no
  stderr assertion at all, and the `runPostCreateHook` stderr tests use a **fake** shell. Since
  WPC-04 requires the error text to reach `output`, and a failing script's stderr is the entire
  point of the failure panel, this is a genuine gap. Fix: assert `stderr` for
  `echo boom 1>&2 & exit /b 1` (my probe confirms it is captured today).
- **R6, R10** — unobservable by construction; not gaps.

## Round-2 Gate Check

| Gate | Command | Result |
| ---- | ------- | ------ |
| Typecheck | `npm run typecheck` | ✅ exit 0 |
| Lint | `npx eslint .` | ✅ **0 errors**, 18 warnings — all pre-existing, all in `scripts/`; the 11 feature files lint clean (zero output) |
| Unit (full) | `npx vitest run --maxWorkers=2` | ⚠️ **531 tests / 39 files** — matches the expected baseline; run A **4 failed / 527 passed** (312 s), run B **6 failed / 525 passed** (195 s) |
| Unit (full) | `npx vitest run --maxWorkers=1` | ⚠️ **1 failed / 530 passed** (367 s) |
| Unit (isolated) | `… tree.test.ts worktree-manager.test.ts` | ✅ **71 / 71 passed** |
| Unit (isolated) | `… hook-shell.test.ts post-create-hook.test.ts repo-config.test.ts` | ✅ **42 / 42 passed** |
| Unit (isolated) | `… worktree-manager.test.ts` | ✅ **67 / 67 passed** |

Test count 521 → **531** (+10: 7 in `hook-shell.test.ts`, 3 in the real-git block), 38 → **39**
files, zero deletions, zero skips.

**Are the failures regressions? No — load-related, verified four ways:**

1. Every failure is in `tree.test.ts` or `worktree-manager.test.ts`, both **unmodified across the
   entire range** — `git diff --name-only c846eb0..98034eb` lists neither, nor `workflow-ctx.ts`.
2. Every failure is a **timeout**, not an assertion: durations 5187 / 5274 / 7170 / 7338 / 7412 /
   8066 / 8379 ms against vitest's default **5000 ms** (`vitest.config.ts` sets no `testTimeout`).
3. **Non-deterministic**: 4, then 6, then 1 failures, a different subset each run.
4. **Green in isolation**: those two files pass 71/71, and `worktree-manager.test.ts` alone 67/67.

## Finding 6 (new, non-blocking) — gate reliability regressed

Round 1 ran the full suite green at `--maxWorkers=2`: **521/521 in 124 s**. Round 2 cannot get a
clean full run at that setting (4 and 6 failures), and even `--maxWorkers=1` failed once; wall time
rose to 195–367 s (1.6–3×). The cause is the *shape* of the new tests, not their content: 7
real-process spawn tests — two of which deliberately leave killed `ping` **grandchildren running**
(`hook-shell.test.ts:67-94`) — plus 3 real-git worktree creates, added to a suite whose pre-existing
real-git tests already sit right at the 5000 ms default. The feature's own tests never failed in any
run (42/42); the collateral damage lands on unmodified files.

This is a **CI/gate-reliability** regression, not a behaviour regression, so it does not block the
verdict — but it makes the documented "use `--maxWorkers=2`" workaround insufficient. Recommended
(not applied — the Verifier is read-only): raise `testTimeout` for the real-git suites, or set it
globally to ~15000 ms in `vitest.config.ts`, and/or give the two `hook-shell` timeout tests explicit
tighter budgets. `.specs/codebase/TESTING.md`'s flakiness note should be extended from 2 files to
include the new real-process/real-git additions.

## Finding 7 (informational) — bare-name commands and `NoDefaultCurrentDirectoryInExePath`

While probing, the spec's own headline command shape failed: with `cwd` set to the worktree and
`SetupSkills.cmd` present in it, `postCreateCommand: "SetupSkills.cmd"` returned **code 1** —
`'SetupSkills.cmd' não é reconhecido como um comando interno ou externo`. `.\SetupSkills.cmd` and an
absolute path both work (code 0).

Root cause: **`NoDefaultCurrentDirectoryInExePath=1` is set in this agent session's process
environment**, which stops `cmd.exe` searching the current directory. `runPostCreateHook` inherits
`process.env` by design (WPC-09), so the child inherits the flag. I confirmed it is **not**
persistent — `[Environment]::GetEnvironmentVariable(…,'User')` and `'Machine'` are both empty, only
the current process has it — and scrubbing it from the child env makes the bare name work.

So this is **not a product defect**: a normally launched app resolves `SetupSkills.cmd` fine, and no
repo test depends on CWD executable resolution (they use `echo` / `exit` / `ping`). It is recorded
because (a) any hand-verification of Success Criterion 1 from inside an agent session will fail
spuriously unless the variable is cleared — the correct reading is "harness artifact", not "hook
broken"; and (b) the README added in the uncommitted working-tree changes documents exactly the
bare-name form, so `.\SetupSkills.cmd` is the more robust example if per-machine hardening ever
matters.

## Working-tree note

At the start of round 2 the tree already carried **concurrent uncommitted edits by the author** to
`README.md`, `.specs/…/spec.md` and `.specs/…/tasks.md` (feature docs + traceability). They are not
mine; I snapshotted their md5s before touching anything and left them byte-identical. Two
observations, since they assert this feature's status:

- `spec.md`'s new "Status after execution" paragraph is inserted **between a table's separator row
  and its first data row**, which breaks the table's rendering and orphans every row below it.
- That paragraph claims WPC-01..16 / WPC-20..24 are **Verified** while every row in the table below
  still reads `Pending`. The claim now agrees with this report's conclusion, but the rows should be
  updated so the document does not contradict itself.

Every file I mutated was restored and md5-verified.

## Round-2 Summary

**Overall**: ✅ Ready to merge.

**Findings closed**: 4 / 4 — including the blocker, independently re-probed rather than taken on
trust
**Sensor**: 9/14 killed, 2 equivalent, **3 real gaps** (R3/R5 settle-condition, R11 stderr) — all
test-strength gaps on code my probes show to be behaviourally correct; none is a behaviour defect
**Gate**: typecheck ✅ · lint ✅ 0 errors · 531 tests / 39 files (expected baseline); feature tests
42/42 green in every run, residual failures are pre-existing load-related timeouts in unmodified
files, proven four ways

**New issues (both non-blocking)**:
1. **Finding 6** — full-suite gate reliability regressed (`--maxWorkers=2` no longer green); raise
   `testTimeout` and/or bound the new real-process tests. Recommended as a follow-up task.
2. **Sensor gaps R3/R5 + R11** — add one large/slow-output completeness test and one real-seam
   stderr assertion to `hook-shell.test.ts`. Two small tests kill all three mutants.

Plus one latent-fragility note (`graceTimer.unref?.()` depends on another live handle) and one
harness artifact (Finding 7) that must not be mistaken for a product bug during UAT.

**Interactive UAT**: still not performed — WPC-12..16 need a live Electron session. This round's
renderer changes were verified by inspection.
