# Worktree Removal Fault Tolerance Validation

**Date**: 2026-07-30
**Spec**: `.specs/features/worktree-removal-fault-tolerance/spec.md`
**Diff range**: `54cf725..HEAD` (branch `feature/worktree-removal-fault-tolerance`, 9 commits: `16d2c2f`,
`34f8970`, `b286a46`, `bdc32fe`, `32eb539`, `dd7f31c`, `f8a4af8`, `b090c6f`, `ac71cfb`, `dcc50dc`)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, re-derived from `spec.md`
**Scope**: WRFT-01 … WRFT-06. **WRFT-07 is out of scope** — deferred to a follow-up PR by owner decision
(AD-014); its absence is not assessed as a gap.

**Verdict**: ❌ **FAIL** — 2 surviving mutants. Both are **test-strength** gaps, not production defects:
the implementation is correct on every path examined, but two spec-mandated outcomes have no assertion
that can detect them regressing.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T0 `34f8970` | ✅ Done | Gate stabilization: global 30 s `testTimeout`/`hookTimeout` in `vitest.config.ts`; `hook-shell.test.ts:100` fixture margin 500 → 1500 ms. Not a weakening — `ping -n 5` still runs ~4 s, so `timedOut` is still genuinely exercised. |
| T1 `b286a46` | ✅ Done | `src/main/dir-remover.ts` (new) |
| T2 `bdc32fe` | ✅ Done | `dir-remover.test.ts` real-fs block (junction / read-only / real-lock) |
| T3 `32eb539` | ✅ Done | `parsePorcelainBlocks` `locked` line |
| T4 `dd7f31c` | ✅ Done | Delete-first reorder in `removeWorktree` |
| T5 `f8a4af8` | ✅ Done | `RemovalLeftover` shared → main → renderer |
| T6 `b090c6f` | ✅ Done | Awaitable `SessionManager.stop` |
| T7 `ac71cfb` | ✅ Done | `scripts/smoke-remove.mjs` + seed — **written, not run** (see WRFT-06) |
| T8 `dcc50dc` | ✅ Done | AD-014 recorded in `STATE.md` |
| T9–T11 | ⏸ Deferred | WRFT-07, follow-up PR (AD-014) — out of scope for this validation |

---

## Spec-Anchored Acceptance Criteria

### WRFT-01 — Delete-then-deregister with pre-flight guards

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC 1 — clean/non-primary/unlocked/registered remove | delete dir **first**, then `git worktree remove`; `{ok:true}`; folder gone **and** entry gone | `worktree-manager.test.ts:833-836` — `expect(seen).toEqual({ registered: true, present: true })`, `expect(result).toEqual({ ok: true })`, `expect(existsSync(sibling)).toBe(false)`, `expect(await listWorktrees(repo)).toHaveLength(1)`. The `seen` probe is taken *inside* the deleter, so it proves git had not yet run. Default-deps wiring separately pinned at `:700-704`. | ✅ PASS |
| AC 2 — unregistered path | refuse, message states "not a registered worktree of this repo", **delete nothing** | `worktree-manager.test.ts:899-902` — `expect(result.error).toMatch(/not a registered worktree of this repo/i)`, `expect(deleter.calls).toEqual([])`, `expect(readFileSync(join(stranger,'precious.txt'),'utf8')).toBe('keep me')` | ✅ PASS |
| AC 3 — `locked` line | refuse with git's lock reason, delete nothing, **including under `force:true`** | `:924-929` (`expect(result.error).toContain('held for review')`, `expect(deleter.calls).toEqual([])`, `toHaveLength(2)`); force variant `:938-941`; bare-`locked` variant `:950-953`; parse-level `:150,159-160,170-171` | ✅ PASS |
| AC 4 — primary checkout | refuse with the unchanged DLWT-01 message before any deletion, incl. force | `:730-732` and `:777-779` — `expect(result.error).toMatch(/primary checkout/i)`, `expect(existsSync(repo)).toBe(true)`; casing/separator variant `:738-739` | ✅ PASS (see precision note P1) |
| AC 5 — dirty without force | refuse with `"N uncommitted change(s) — commit or stash before removing."` before any deletion | `:712-715` — `expect(result.error).toContain('1 uncommitted change')`, `expect(existsSync(sibling)).toBe(true)`, `toHaveLength(2)`; untracked variant `:718-725` | ✅ PASS (see precision note P1) |
| AC 6 — `force` skips only the dirty check | AC 2/3/4 still refuse under force | AC 2 is *called* with `{force:true}` at `:897`; AC 3 force at `:936`; AC 4 force at `:775`; force-skips-dirty at `:745-748` | ✅ PASS |

### WRFT-02 — A worktree is never deregistered while its files remain

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC 1 — deletion does not complete | `git worktree remove` **not invoked at all**; still in `git worktree list --porcelain`; `{ok:false}` | `worktree-manager.test.ts:849-852` — `expect(failed.ok).toBe(false)`, `expect(existsSync(sibling)).toBe(true)`, `expect(porcelainOf()).toContain(sibling.replaceAll('\\','/'))`, `expect(await listWorktrees(repo)).toHaveLength(2)`. Also `dir-remover.test.ts:320-324`. Asserted by consequence (still registered) rather than a call-spy — sensor M1 confirms this is sufficient to detect the fall-through. | ✅ PASS |
| AC 2 — retry after the holder ends | both steps complete, `{ok:true}` | `worktree-manager.test.ts:857-859` — `expect(retried).toEqual({ ok: true })`, folder gone, `toHaveLength(1)`. Real-process proof: `dir-remover.test.ts:339-340` — `expect(retried).toEqual({ ok: true })` after `stopHolder`. | ✅ PASS |
| AC 3 — deletion ok, git fails | `{ok:false}` carrying git's **first stderr line**; a retry returns `{ok:true}` | `worktree-manager.test.ts:965-973` — `expect(failed.error).toMatch(/^fatal: /)`, `expect(await listWorktrees(repo)).toHaveLength(2)`, then `expect(retried).toEqual({ ok: true })` | ✅ PASS |
| AC 4 — directory already absent | deletion is a no-op, bookkeeping still runs, `{ok:true}` | `dir-remover.test.ts:84-85` — `expect(result).toEqual({ ok: true })`, `expect(calls).toHaveLength(0)`; end-to-end `worktree-manager.test.ts:797-798` — `expect(result).toEqual({ ok: true })`, `toHaveLength(1)` | ✅ PASS |

### WRFT-03 — Removal never destroys data outside the worktree

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC 1 — junction unlinked, not recursed | every file under the target still exists **with unchanged content** | `dir-remover.test.ts:258-259` — `expect(readFileSync(join(shared,'precious.txt'),'utf8')).toBe('keep me')`, `expect(readFileSync(join(shared,'nested','deep.txt'),'utf8')).toBe('keep me too')`; liveness precondition at `:252` | ✅ PASS |
| AC 2 — result and worktree state | `{ok:true}` and the worktree folder (junction entry included) gone | `dir-remover.test.ts:256-257` — `expect(result).toEqual({ ok: true })`, `expect(existsSync(worktree)).toBe(false)` | ✅ PASS |
| AC 3 — dangling junction | removal still succeeds | `dir-remover.test.ts:273-274` — `expect(result).toEqual({ ok: true })`, `expect(existsSync(worktree)).toBe(false)` | ✅ PASS |

*Layer note*: WRFT-03 is verified at the `removeDirTree` boundary, not through `removeWorktree`
(the spec's Independent Test phrases it at the `removeWorktree` level). The gap is bridged because
`removeWorktree`'s default `realRemoveDeps` wiring is independently pinned by `worktree-manager.test.ts:700-704`
(a real remove with no injected deleter). Sensor M12 confirms the junction assertion is what does the work.

### WRFT-04 — Bounded retry with an actionable leftover report

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC 1 — retry set, 250 ms spacing, `maxRetries: 0` | retry `EBUSY`/`EPERM`/`ENOTEMPTY`/`EACCES` every 250 ms; each attempt `maxRetries: 0` | `dir-remover.test.ts:97-98` (all four codes → `expect(result).toEqual({ ok: true })`, `expect(calls).toHaveLength(5)`); `:108` — `expect(attemptsAt.map((at) => at - startedAt)).toEqual([0, 250, 500])`; `:166-169` — `expect(calls).toEqual([{ path: ROOT, options: { recursive: true, force: true, maxRetries: 0 } }, …])`; literals pinned at `:176-177` | ✅ PASS |
| AC 2 — lock clears within budget | proceed to bookkeeping, `{ok:true}` | `dir-remover.test.ts:97` — `expect(result).toEqual({ ok: true })`; bookkeeping continuation at `worktree-manager.test.ts:834-836` | ✅ PASS |
| AC 3a — budget exhausted → `{ok:false}` at 3000 ms | give up exactly at the 3000 ms deadline | `dir-remover.test.ts:119-122` — `expect(result.ok).toBe(false)`, `expect(result.code).toBe('EBUSY')`, `expect(Date.now() - startedAt).toBe(3000)`, `expect(attemptsAt.at(-1)! - startedAt).toBe(3000)` | ✅ PASS |
| AC 3b — `DirRemovalResult.leftover` payload | `{blockedPath, remaining}` | `dir-remover.test.ts:148` — `expect(result.leftover).toEqual({ blockedPath: blocked, remaining: 3 })`; fallback `:156` — `expect(result.leftover).toEqual({ blockedPath: ROOT, remaining: 1 })` | ✅ PASS |
| AC 3c — **`RemoveWorktreeResult.leftover` payload** | the *removal result* SHALL carry `leftover` with `blockedPath` and `remaining` | **no evidence** — searched `worktree-manager.test.ts` for `leftover` assertions: the only occurrences (`:844`, `:867`, `:882`) are **inputs** to the `spyDeleter` fixture, never assertions on the returned `RemoveWorktreeResult`. Sensor **M6 survived**. | ❌ **GAP** |
| AC 3d — error message content | names `blockedPath`, states the remaining count, says still-registered and retryable | `worktree-manager.test.ts:872-875` — `expect(result.error).toContain(blocked)`, `toContain('3 items still on disk')`, `toMatch(/still registered/i)`, `toMatch(/retry/i)`; singular form `:887-888` | ✅ PASS |
| AC 3e — `remaining` = "entries still present under the worktree root" | a real (recursive) count of what is left | `dir-remover.test.ts:323` — `expect(result.leftover?.remaining).toBeGreaterThanOrEqual(1)` — the only real-filesystem check, and too weak to pin a value. Sensor **M13 survived**. | ⚠️ **GAP + spec-precision gap (P2)** |
| AC 4 — non-retryable code | report immediately, budget untouched | `dir-remover.test.ts:132-135` — `expect(result.ok).toBe(false)`, `expect(result.code).toBe('EINVAL')`, `expect(attemptsAt).toHaveLength(1)`, `expect(Date.now() - startedAt).toBe(0)` | ✅ PASS |
| AC 5 — any failure returns within 5000 ms | wall-clock bound, literal | `dir-remover.test.ts:325` — `expect(elapsed).toBeLessThan(5000)` (real holder process) | ✅ PASS |

### WRFT-05 — Terminated sessions are really gone before deletion starts

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC 1 — observe the real exit, or 3000 ms | `stop` resolves on the PTY's own exit event | `session-manager.test.ts:359-377` — `expect(port.handles[0].killed).toBe(true)`, `expect(manager.list()[0].status).toBe('stopped')`, `expect(config.get().sessions[0].status).toBe('stopped')`, then `await vi.advanceTimersByTimeAsync(2999); expect(settled).toBe(false)`, then `port.handles[0].emitExit(0); await stopped; expect(settled).toBe(true)` | ✅ PASS |
| AC 2 — proceed anyway after the wait | resolve at 3000 ms even with no exit event | `session-manager.test.ts:380-397` — `expect(SESSION_EXIT_WAIT_MS).toBe(3000)` (literal), `advanceTimersByTimeAsync(2999)` → `expect(settled).toBe(false)`, `advanceTimersByTimeAsync(1)` → `expect(settled).toBe(true)`, `expect(port.handles[0].killed).toBe(true)` | ✅ PASS |
| AC 3 — handles released shortly after exit are absorbed by the WRFT-04 loop | removal succeeds without user action | `dir-remover.test.ts:97-98` — the fake fails 4 times then succeeds inside one call, `expect(result).toEqual({ ok: true })`. Evidence located, but indirect: no test exercises a *real* holder that exits mid-loop (spec finding F's "own loop, holder exits at 600 ms → OK" row is unreplicated); `dir-remover.test.ts:328-341` covers the *second call*, not mid-loop self-healing. | ✅ PASS (thin — see note C1) |
| AC 4 — a session stop failure aborts removal, error inline | unchanged existing behavior | `src/renderer/src/components/WorktreeDetail.tsx:180-186` — `.catch` sets `removing=false` and `removeError`. Renderer: not unit-tested by convention (TESTING.md, AD-004/AD-011). Code present and behaviourally unchanged in the diff. | ⏳ Convention-exempt, unverified by test |
| Quit-path regression | `killAll` must stay synchronous | `session-manager.test.ts:400-415` — `expect(manager.killAll()).toBeUndefined()`, all handles killed, all statuses `stopped` in both `list()` and config | ✅ PASS |

### WRFT-06 — The failure is visible in the UI and the row stays

Renderer requirement. Per `.specs/codebase/TESTING.md` and AD-004/AD-011, renderer React components are
**not** unit-tested; they are verified by CDP smoke plus a visual pass, and the smoke is hand-run by the
owner on a live desktop session (never CI). The smoke was **written but never executed**.

| Criterion | Spec-defined outcome | Located evidence | Result |
| --- | --- | --- | --- |
| AC 1 — error names blocked path + remaining count; row survives a refresh | inline error + row still listed | Producer: `WorktreeDetail.tsx:332-341` renders `removeLeftover.remaining` + `removeLeftover.blockedPath`. Smoke checks written at `scripts/smoke-remove.mjs:291-305` (`norm(blocked.path) === norm(heldDir)`) and `:322-331` (`/\d+ items? still on disk/`, `/still registered/`, row-after-refresh). **Not executed.** | ⏳ **Unverified** — no executed evidence |
| AC 2 — retry after releasing the holder succeeds, toast shows | row gone + `"Removed <branch>"` | `smoke-remove.mjs:344-360` — `retried.rowGone === true`, `/Removed lock\/me/`. **Not executed.** | ⏳ **Unverified** |
| AC 3 — Remove button re-enables | no permanent busy state | `WorktreeDetail.tsx:133` sets `setRemoving(false)` on failure; smoke check `smoke-remove.mjs:307-311` (`blocked.disabled === false`). **Not executed.** | ⏳ **Unverified** |
| AC 4 — long blocked path wraps/scrolls without pushing layout | mirror the inline-error treatment | `WorktreeDetail.css:361-378` — `.detail-danger-leftover { flex-direction: column; min-width: 0 }`, `.detail-danger-path { word-break: break-all }`. No automated or visual check performed. | ⏳ **Unverified** |

**Assessment**: the *absence of unit tests* here is convention-consistent and correct — this is not a gap.
The *absence of any executed evidence* is a real, currently-open verification hole, but it is the one the
spec already declares (`spec.md` traceability: WRFT-06 is "pending Verifier **and** the owner's live smoke +
visual pass"). It is discharged by the owner running `node scripts/seed-smoke-remove.mjs` then
`node scripts/smoke-remove.mjs` against a live session, not by any change to this branch. A blocking
caveat, not a defect.

**Status**: ❌ Gaps present — WRFT-04 AC 3 has two uncovered halves (3c, 3e); WRFT-06 is unverified
pending the owner's smoke run. WRFT-01, WRFT-02, WRFT-03 and WRFT-05 are fully covered and spec-anchored.

---

## Payload / Conjunction Rule

| Type | Field | Asserted on value/state? |
| --- | --- | --- |
| `DirRemovalResult` | `ok` | ✅ `dir-remover.test.ts:84,97,119,132,256,273,320` |
| `DirRemovalResult` | `code` | ✅ `:120` (`'EBUSY'`), `:133` (`'EINVAL'`), `:321` (`'EBUSY'`) |
| `DirRemovalResult` | `leftover.blockedPath` | ✅ `:148`, `:156`, `:322` — exact-value equality |
| `DirRemovalResult` | `leftover.remaining` | ⚠️ exact only against the **injected fake** (`:148` = 3, `:156` = 1). Against the real filesystem only `>= 1` (`:323`). |
| `RemoveWorktreeResult` | `ok` | ✅ `worktree-manager.test.ts:834,849,899,912,924,938,950,965` |
| `RemoveWorktreeResult` | `error` | ✅ content-asserted, not just presence: `:872-875`, `:887-888`, `:900`, `:926`, `:966` |
| `RemoveWorktreeResult` | **`leftover`** | ❌ **never asserted** — the field the renderer keys its whole structured-error branch on |
| `RemoveWorktreeResult` | `leftover.blockedPath` / `.remaining` | ❌ never asserted at this boundary |

---

## Discrimination Sensor

Mutations were applied to a scratch state only (edit → targeted `vitest run` → `git checkout --` restore).
The working tree was verified byte-identical to pre-mutation backups afterwards.

| # | File:line | Mutation | Killed? | Killing test(s) |
| --- | --- | --- | --- | --- |
| M1 | `worktree-manager.ts:330` | deletion-failure path falls through and calls `git worktree remove` anyway (**the central invariant**) | ✅ Killed | `worktree-manager.test.ts:849` — `expected true to be false` on `failed.ok` |
| M2 | `worktree-manager.ts:310` | `locked` guard moved to **after** the deletion step | ✅ Killed (3) | `:927`, `:940`, `:952` — `expected [Array(1)] to deeply equal []` on `deleter.calls` |
| M3 | `worktree-manager.ts:310` | `locked` guard deleted entirely | ✅ Killed (3) | same three `deleter.calls` assertions |
| M4 | `worktree-manager.ts:415` | bare `locked` line reads as **unlocked** (`l === 'locked'` branch dropped) | ✅ Killed (2) | `:158` — `expected undefined to be ''`; `:952` — `deleter.calls` non-empty |
| M5 | `worktree-manager.ts:304` | registered-worktree guard flipped — an unregistered path is accepted | ✅ Killed | `:900` — got `fatal: '…' is not a working tree`, expected `/not a registered worktree of this repo/i` |
| M6 | `worktree-manager.ts:335-339` | `leftover: { blockedPath, remaining }` dropped from the failure result (error string kept) | ❌ **SURVIVED** | none — full file: **80 passed (80)** |
| M7 | `dir-remover.ts:77` | `maxRetries: 0` → `5` | ✅ Killed (2) | `:166` options payload; **and** `:325` — real-lock elapsed `12569` ≥ 5000, empirically reproducing spec finding F |
| M8 | `dir-remover.ts:17` | `DELETE_RETRY_INTERVAL_MS` 250 → 300 | ✅ Killed (2) | `:108` — `[0,300,600]` vs `[0,250,500]`; `:176` |
| M9 | `dir-remover.ts:20` | `DELETE_RETRY_BUDGET_MS` 3000 → 6000 | ✅ Killed (3) | `:121`, `:177`, and `:325` (`6190` ≥ 5000) |
| M10 | `dir-remover.ts:81` | every error code treated as retryable | ✅ Killed | `:134` — 13 attempts instead of 1 |
| M11 | `dir-remover.ts:67` | missing path returns `{ok:false}` | ✅ Killed | `:84` — `{ok:false}` vs `{ok:true}` |
| M12 | `dir-remover.ts:50-54` | real deleter **follows junctions** (`statSync` walk instead of `fs.rm`) | ✅ Killed (2) | `:258` — `ENOENT … shared\precious.txt`: the shared target really was destroyed, exactly the AD-013 loss the feature exists to stop |
| M13 | `dir-remover.ts:53` | real `readEntries` made non-recursive — understates `remaining` | ❌ **SURVIVED** | none — full file: **15 passed (15)** |
| M14 | `dir-remover.ts:101` | `remaining` off-by-one (count *plumbing*) | ✅ Killed (2) | `:148`, `:156` |
| M15 | `session-manager.ts:145` | `stop()` resolves immediately instead of awaiting the real exit | ✅ Killed (2) | `:373`, `:392` — `expected true to be false` on `settled` |
| M16 | `session-manager.ts:145-161` | the `SESSION_EXIT_WAIT_MS` cap removed — `stop` waits forever | ✅ Killed | `:380` — test timed out in 30000 ms |

**Sensor depth**: P0-full (16 mutations; data-integrity + destructive-filesystem path).
**Result**: **14/16 killed, 2 survived** — ❌ FAIL

### Survivor analysis

**M6 — `RemoveWorktreeResult.leftover` is unasserted.** `removeWorktree` can stop returning the structured
payload entirely and all 80 `worktree-manager` tests still pass. `RemoveWorktreeResult` is only exercised by
that one file (verified: `removeWorktree` has no other test caller). WRFT-04 AC 3 mandates the field by name,
and `WorktreeDetail.tsx:135` branches on `result.leftover` — with it gone, the renderer silently degrades from
the structured two-row block (WRFT-06 AC 1 / AC 4) to the flat error line, and nothing in the suite notices.
The three `leftover:` occurrences in the test file are fixture *inputs* to `spyDeleter`, which is precisely the
shape the payload/conjunction rule is designed to catch: the value goes in, but nothing checks it comes back out.

**M13 — the real recursive entry count is unpinned.** Changing `readdir(path, { recursive: true })` to
`readdir(path)` makes `remaining` report only the root's direct children and no test fails. This is the
answer to the probe on `dir-remover.test.ts:323`'s `remaining >= 1`: the exact-count coverage the author
cites at `:148` **partially** compensates — M14 proves it kills any mutation of the count *plumbing* — but
it exercises the **injected fake** `readEntries`, so it cannot see a mutation of the real-fs implementation.
`:323` is the only real-filesystem check and `>= 1` is satisfied by any non-zero count. A wrong `remaining`
therefore reaches the user's error message undetected.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ `dir-remover.ts` is 105 lines, one exported function plus two constants |
| Surgical changes | ✅ `removeWorktree` keeps its signature; guard messages preserved verbatim |
| No scope creep | ✅ WRFT-07 correctly left unbuilt; T9–T11 written but not executed |
| Only touched files required | ✅ 19 files, all traceable to a task; `hook-shell.test.ts` touch justified by T0 |
| Matches existing patterns | ✅ DI-with-real-defaults (`DirRemoverDeps`, `WorktreeRemoveDeps`) mirrors `SessionManagerDeps`; hand-rolled fakes, no `vi.mock` (TESTING.md) |
| Would a senior engineer approve? | ✅ The `maxRetries: 0` and `unref` comments carry the measured reasoning; the guard-order contract is documented at the call site |
| Tests map to ACs, non-shallow | ✅ Every new test carries its WRFT-NN AC reference in a comment |
| Spec-anchored outcome check | ⚠️ 2 gaps (WRFT-04 AC 3c, 3e) + 2 spec-precision notes |
| Per-layer Coverage Expectation | ✅ Domain logic 1:1 with ACs; renderer exempt by AD-004/AD-011 |
| No unclaimed tests | ✅ All 31 new tests map to a WRFT AC or a listed Edge Case |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (no `vi.mock`, real temp dirs, renderer exempt), AD-005 (Windows path assertions, `realpathSync.native`), lessons L-001/L-004/L-005 all visibly applied |

---

## Edge Cases (from `spec.md` §Edge Cases)

- [x] Concurrent double-remove is idempotent — `dir-remover.test.ts:84-85` (absent path → `{ok:true}`, zero `rm` calls) + `worktree-manager.test.ts:797-798`
- [x] Read-only files / nested repo with a `0444` object store — `dir-remover.test.ts:284-287`, `:303-306`
- [x] Repo gone or git unavailable → fail closed, delete nothing — `worktree-manager.test.ts:912-915` (`expect(deleter.calls).toEqual([])`, `expect(existsSync(sibling)).toBe(true)`)
- [x] Paths with spaces / non-ASCII — unchanged `execFile` discipline; `unquotePath` coverage pre-exists
- [ ] Detached-HEAD worktree removal — **no located test**. Behavioural risk is low (`parsePorcelainBlocks` handles `detached` and `removeWorktree` never reads `branch`), but there is no evidence.
- [ ] Path > 260 chars → surfaces as a named leftover failure — **no located test**; spec explicitly marks this "not probed" under Assumptions, so this is a knowing, documented omission rather than an oversight.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Full gate, `tasks.md` §Gate Check Commands)
- **Result**: **564 passed, 0 failed, 0 skipped** — 40 test files. Exit code 0.
  - `typecheck`: clean (node + web projects)
  - `lint`: **0 errors, 18 warnings** — all `prettier/prettier` in `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`; none in any file this diff touches. Pre-existing.
  - `test`: 191.33 s wall
- **Test count before feature**: 533 tests / 39 files (post-T0 baseline)
- **Test count after feature**: 564 tests / 40 files
- **Delta**: **+31 tests, +1 file, zero deletions** — the DLWT/FRWT regression set is intact and unweakened
- **Skipped tests**: none
- **Failures**: none
- **Manual gate**: `node scripts/smoke-remove.mjs` — **NOT RUN** (needs a live desktop session; owner-run)

---

## Fix Plans

### Fix 1: assert `RemoveWorktreeResult.leftover` — Blocker for WRFT-04 AC 3

- **Root cause**: the three WRFT failure tests assert only `result.error`; `result.leftover` is a fixture
  input, never an expected output. The field can be deleted from production with a green suite.
- **Fix task**: in `worktree-manager.test.ts`, add to the existing test at `:862-876` (or as a sibling):
  `expect(result.leftover).toEqual({ blockedPath: blocked, remaining: 3 })`, and in the give-up test at
  `:847-852` add `expect(failed.leftover).toEqual({ blockedPath: blocked, remaining: 3 })`. Also assert its
  **absence** on a guard refusal (e.g. `expect(result.leftover).toBeUndefined()` in the locked test at `:922`)
  — `shared/worktrees.ts:110-116` documents "never on a guard refusal", and that half is unasserted too.
- **Verify**: re-run mutation M6 (drop the `leftover` key from `worktree-manager.ts:335-339`); it must fail.
- **Priority**: **Blocker** — it is the field WRFT-06's UI contract depends on.

### Fix 2: pin the real recursive `remaining` count — Major for WRFT-04 AC 3

- **Root cause**: `dir-remover.test.ts:323` uses `toBeGreaterThanOrEqual(1)`; the exact-count tests run
  against the injected fake, so the real `readdir(…, { recursive: true })` wiring is unpinned.
- **Fix task**: in the real-lock test at `:309-326`, build a fixture whose post-failure residue is
  deterministic and assert the exact value (the held `sub/` plus `sub/deep.txt` gives a stable `2`); or add a
  small dedicated real-fs test that calls `removeDirTree` on a tree with a known nested-entry count and
  asserts `leftover.remaining` exactly. Prefer a nested entry so a non-recursive read is distinguishable.
- **Verify**: re-run mutation M13 (`readEntries: (path) => readdir(path)`); it must fail.
- **Priority**: **Major** — wrong-but-plausible numbers in a user-facing error message.

### Fix 3 (optional): tighten the spec, not the test — Minor

- **Root cause**: spec-precision gap P2 below. `remaining` is defined as "the count of entries still present
  under the worktree root" without saying recursive vs. direct children — the ambiguity that made M13 legal.
- **Fix task**: amend WRFT-04 AC 3 to say "the **recursive** count of entries still present under the
  worktree root". Do this *before* Fix 2 so the new assertion has an unambiguous target.
- **Priority**: Minor.

---

## Spec-Precision Gaps (flagged, not silently passed)

- **P1** — WRFT-01 AC 4 and AC 5 refer to "the unchanged DLWT-01 message" and quote
  `"N uncommitted change(s) — commit or stash before removing."`, but the tests assert distinctive
  substrings (`/primary checkout/i`, `.toContain('1 uncommitted change')`) rather than the full literal.
  The distinctive fragment is pinned, so a message regression that matters would still be caught; recorded
  for transparency, not counted as a gap.
- **P2** — WRFT-04 AC 3 does not define whether `remaining` is recursive. This is the precision gap that
  made surviving mutant M13 spec-legal. See Fix 3.
- **P3** — WRFT-05 AC 3 says the retry loop "SHALL absorb the delay" but does not state an observable
  outcome distinct from WRFT-04 AC 2, so the criterion cannot be tested independently of it. Coverage
  note C1 below.

## Coverage Notes

- **C1** — WRFT-05 AC 3 is covered only via the fake-deleter retry test (`dir-remover.test.ts:88-99`). No
  test reproduces spec finding F's "own loop, holder exits at 600 ms → OK" row with a real process exiting
  *mid-loop*; `:328-341` covers a second call after the holder is gone, which is WRFT-02 AC 2. Located
  evidence exists, so this passes, but the real mid-loop self-heal is unproven.
- **C2** — WRFT-03 is asserted one layer below `removeWorktree`. Bridged by the default-deps test at
  `worktree-manager.test.ts:700-704`; noted because the spec phrases the Independent Test at the outer layer.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| WRFT-01 | ⚙ Implemented — pending Verifier | ✅ **Verified** |
| WRFT-02 | ⚙ Implemented — pending Verifier | ✅ **Verified** |
| WRFT-03 | ⚙ Implemented — pending Verifier | ✅ **Verified** |
| WRFT-04 | ⚙ Implemented — pending Verifier | ❌ **Needs Fix** — AC 3c and AC 3e uncovered (M6, M13) |
| WRFT-05 | ⚙ Implemented — pending Verifier | ✅ **Verified** (AC 4 convention-exempt; AC 3 thin — C1) |
| WRFT-06 | ⚙ Implemented — pending Verifier + owner smoke | ⏳ **Unverified** — blocked on the owner's live smoke + visual pass |
| WRFT-07 | ⏸ Deferred (AD-014) | ⏸ **Deferred** — out of scope, not assessed |

---

## Summary

**Overall**: ⚠️ **Issues — not ready to close**

**Spec-anchored check**: 22/24 assessed acceptance criteria matched their spec-defined outcome;
**2 criteria uncovered** (WRFT-04 AC 3c, AC 3e), **3 spec-precision gaps** flagged (P1, P2, P3),
**4 criteria unverified pending the owner's smoke** (WRFT-06 AC 1–4).
**Sensor**: 14/16 mutations killed, **2 survived**.
**Gate**: 564 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors / 18 pre-existing warnings.

**What works** — and is genuinely proven, not merely asserted:
- The central invariant holds. Making the deletion-failure path call git anyway (M1) is caught: a worktree
  can never be deregistered while its files remain.
- The junction data-loss path is closed. A deleter that follows junctions (M12) is caught by the shared
  target's `precious.txt` going missing — the AD-013 defect cannot silently return.
- Every pre-deletion guard is order-sensitive and position-pinned: moving (M2), deleting (M3), or weakening
  (M4) the lock guard, and flipping the registered guard (M5), are all caught by `deleter.calls` staying empty.
- The retry policy is pinned to literals, not constants: interval (M8), budget (M9), `maxRetries: 0` (M7),
  the retryable set (M10) and the absent-path no-op (M11) are all killed. M7 and M9 were additionally caught
  by the real-lock test's 5000 ms bound, independently reproducing spec finding F on this machine.
- `SessionManager.stop` really waits: resolving early (M15) and removing the cap (M16) are both caught,
  and `killAll` is pinned as synchronous so quit never stalls.

**Issues found**:
1. `RemoveWorktreeResult.leftover` is never asserted (M6 survived) — WRFT-04 AC 3 → Fix 1.
2. The real recursive `remaining` count is unpinned (M13 survived) — WRFT-04 AC 3 → Fix 2 (+ Fix 3).
3. WRFT-06 has no executed evidence — the smoke script exists and reads correctly, but has never run.

**Next steps**:
1. Apply Fix 1 and Fix 2 (test-only; no production change is warranted — the implementation is correct).
2. Re-run the discrimination sensor for M6 and M13 specifically; both must be killed.
3. Owner runs `node scripts/seed-smoke-remove.mjs` then `node scripts/smoke-remove.mjs` against a live
   session to discharge WRFT-06, plus the visual pass for AC 4.
4. Optionally amend WRFT-04 AC 3 for P2 before writing the Fix 2 assertion.
