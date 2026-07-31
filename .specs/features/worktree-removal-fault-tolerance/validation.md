# Worktree Removal Fault Tolerance Validation — Round 3 (final)

**Date**: 2026-07-30
**Spec**: `.specs/features/worktree-removal-fault-tolerance/spec.md` (as amended by `6f3af8a`)
**Diff range**: `54cf725..HEAD` (branch `feature/worktree-removal-fault-tolerance`, 15 commits)
**New since round 2**: `1abe8aa` (F3 — mixed file/directory leftover fixture), `45c27d5` (F4 — guard
`leftover` absence on all four refusal paths)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, re-derived from `spec.md`.
The Verifier wrote none of this code and re-ran every mutation itself; the fix worker's transcript was
not relied on anywhere in this report.
**Scope**: WRFT-01 … WRFT-06. **WRFT-07 is out of scope** — deferred to a follow-up PR by owner
decision (AD-014); its absence is not assessed as a gap.

**Verdict**: ✅ **PASS** — both round-2 survivors (N3, N6) are genuinely killed, verified independently
and clause by clause. Three mutants survived this round; all three are **non-blocking** (one contrived,
one spec-undefined, one cosmetic-wording), and none corresponds to a plausible wrong implementation that
would change user-visible behaviour. **Nothing here blocks merging.** WRFT-06 remains unverified pending
the owner's live smoke — an unchanged caveat, not a finding.

This was the third and final permitted iteration. The residual items below are reported for the owner's
decision, not looped back.

---

## Findings across all three rounds — full history and resolution status

| # | Raised | Finding | Status now | Evidence |
| --- | --- | --- | --- | --- |
| **M6** | R1 | `RemoveWorktreeResult.leftover` never asserted (WRFT-04 AC 3d) | ✅ **CLOSED** in R2 | R2 re-run: `2 failed \| 78 passed` on `:858`, `:886` |
| **M13** | R1 | real recursive `remaining` unpinned (WRFT-04 AC 3b) | ✅ **CLOSED** in R2 | R3 re-run of the non-recursive mutant: **2 failed \| 15 passed (17)**, `:370` and `:395` both `- 3 / + 1` |
| **P1** | R1 | WRFT-01 AC 4/5 quote message literals; tests pin distinctive fragments only | ⏳ **OPEN — non-blocking** (stance unchanged, now *evidenced*) | R3 probe: gutting both guard messages to bare fragments left **80 passed (80)**. Behaviour (refuse + delete nothing) is fully pinned; only wording is loose |
| **P2** | R1 | spec did not say whether `remaining` is recursive | ✅ **CLOSED** in R2 by `6f3af8a` | `spec.md:280-281` now says "the **recursive** count of every entry still present anywhere under the worktree root" |
| **P3** | R1 | WRFT-05 AC 3 has no observable outcome distinct from WRFT-04 AC 2 | ⏳ **OPEN — non-blocking** | `spec.md:309-310` unchanged. Coverage note C1 stands |
| **C1** | R1 | WRFT-05 AC 3 covered only via the fake-deleter retry test; spec finding F's "holder exits mid-loop" unreplicated | ⏳ **OPEN — non-blocking** | Unchanged |
| **C2** | R1 | WRFT-03 asserted one layer below `removeWorktree`, bridged by the default-deps test | ⏳ **OPEN — informational** | Bridge at `worktree-manager.test.ts:699-705` |
| **N3** | R2 | `remaining` counting only **directories** passed the whole suite (WRFT-04 AC 3b) | ✅ **CLOSED** by `1abe8aa` | R3 independent re-run: **1 failed \| 16 passed (17)** — `dir-remover.test.ts:395`, `- "remaining": 3 / + "remaining": 2` |
| **N6** | R2 | guard-refusal `leftover` absence asserted on 1 of 4 guards (WRFT-04 AC 3e) | ✅ **CLOSED** by `45c27d5` | R3: each guard mutated **separately**; all three new assertions are individually load-bearing (see sensor table) |
| **C3** | R2 | `dir-remover.test.ts:348`'s `toBeGreaterThanOrEqual(1)` "discriminates nothing beyond non-zero" | ✅ **SUPERSEDED** in R3 | Probe O3 shows `:348` *does* kill a `remaining: 0` regression (`expected 0 to be greater than or equal to 1`). It is weak, not inert |
| **O4 / P4** | **R3** | `blockedPath` may name the **first** failing attempt's entry rather than the **last**; the suite cannot tell, and the spec does not say which | ⏳ **OPEN — non-blocking (new)** | R3 probe: **17 passed (17)** — survived. See §Survivor analysis |
| **O5** | **R3** | a guard `leftover` conditioned on `force: true` slips past the three force-path guard tests | ⏳ **OPEN — non-blocking (new)** | R3 probe: **80 passed (80)** — survived. See §Survivor analysis |
| — | R1 | **WRFT-06 has no executed evidence** (CDP smoke needs the owner's live session) | ⏳ **UNCHANGED CAVEAT** — not a finding | See WRFT-06 section |

**Summary: 12 findings raised across three rounds — 6 closed (M6, M13, N3, N6, P2, C3), 6 open
(P1, P3, C1, C2, O4/P4, O5), all six non-blocking — plus 1 unchanged caveat (WRFT-06).**

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T0–T8 | ✅ Done | Unchanged from round 1 |
| F1 `124340c` | ✅ Done | Test-only, additions only |
| F2 `5aafb90` | ✅ Done | Test-only, one new real-fs test |
| Fix 3 `6f3af8a` | ✅ Done | Spec-only: WRFT-04 AC 3 amended |
| **Fix 4 `1abe8aa`** | ✅ **Done** | Test-only. `dir-remover.test.ts` **+52 / −1**; the single deletion is the `afterEach` `rmSync` line, replaced by the retrying form — no assertion removed |
| **Fix 5 `45c27d5`** | ✅ **Done** | Test-only. `worktree-manager.test.ts` **+8 / −0** — pure additions |
| T9–T11 | ⏸ Deferred | WRFT-07, follow-up PR (AD-014) — out of scope |

**No production line changed across any of the four fixes** — independently confirmed:
`git diff --name-only dcc50dc..HEAD` touches only `*.test.ts`, `tasks.md` and `.specs/`.

---

## Spec-Anchored Acceptance Criteria (re-derived against the current spec text)

Evidence-or-zero: every criterion below carries a `file:line` + assertion expression, or it is counted
as NOT covered.

### WRFT-01 — Delete-then-deregister with pre-flight guards (`spec.md:203-216`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| 1 | delete first, then `git worktree remove`; `{ ok: true }`, folder gone, entry gone | `worktree-manager.test.ts:839` — `expect(seen).toEqual({ registered: true, present: true })` (the deleter observes git as *not yet run*); `:840-842`; `:702-704` | ✅ PASS |
| 2 | unregistered path → refuse, delete nothing | `:913` `/not a registered worktree of this repo/i`; `:916` `expect(deleter.calls).toEqual([])`; `:917` `readFileSync(precious.txt) === 'keep me'` | ✅ PASS |
| 3 | `locked` line → refuse with git's reason, delete nothing, incl. under force | `:940-941`, `:945-947`; force: `:956-959`; bare-locked `''`: `:968-971`; parse: `:120`ff | ✅ PASS |
| 4 | primary checkout → unchanged DLWT-01 message, before any deletion, incl. force | `:735` `/primary checkout/i`, `:738`; casing/separators `:744-745`; force `:783-785` | ✅ PASS (precision note **P1**) |
| 5 | dirty + no force → unchanged `"N uncommitted change(s) …"` message, before any deletion | `:713` `.toContain('1 uncommitted change')`, `:718-719`; untracked counts as dirty `:727-728` | ✅ PASS (precision note **P1**) |
| 6 | `force` skips **only** the dirty check | `:753-754` (dirty force-removes); AC 2/3/4 still refuse under force: `:910`, `:954`, `:781` | ✅ PASS |

### WRFT-02 — Never deregistered while files remain (`spec.md:231-239`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| 1 | git NOT invoked, still listed, `{ ok: false }` | `:855`, `:860` `expect(porcelainOf()).toContain(sibling…)`, `:861` `toHaveLength(2)`, `:859` folder present | ✅ PASS (**the central invariant** — mutation M1 re-killed) |
| 2 | retry after the holder ends → `{ ok: true }` | `:866-868`; real fs: `dir-remover.test.ts:412-413` | ✅ PASS |
| 3 | delete ok / git fails → `{ ok: false }` + git's first stderr line; retry heals | `:983-984` `/^fatal: /`, `:985`; retry `:989-991` | ✅ PASS |
| 4 | directory already absent → no-op delete, bookkeeping still runs, `{ ok: true }` | `:803-804`; unit: `dir-remover.test.ts:84-85` `expect(calls).toHaveLength(0)` | ✅ PASS |

### WRFT-03 — Removal never destroys data outside the worktree (`spec.md:254-259`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| 1 | junction unlinked, target files intact with unchanged content | `dir-remover.test.ts:283-284` — `readFileSync(shared/precious.txt) === 'keep me'` and `nested/deep.txt === 'keep me too'`, after `:277` proves the junction was live | ✅ PASS (mutation M12 re-killed) |
| 2 | `{ ok: true }`, worktree folder incl. the junction entry gone | `:281-282` | ✅ PASS |
| 3 | dangling junction still unlinks | `:298-299` | ✅ PASS |
| — | reaches `removeWorktree` via default deps | bridged by `worktree-manager.test.ts:699-705` (note **C2**) | ⚠️ layer note |

### WRFT-04 — Bounded retry with an actionable leftover report (`spec.md:274-288`)

AC 3 carries five distinct clauses; each is assessed separately.

| Clause | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| **3a** `blockedPath` = the entry that could not be deleted | exact path, and specifically the **held entry**, not an ancestor | `dir-remover.test.ts:148`, `:156`, `:347`, `:370`, **`:395`** — `toEqual({ blockedPath: held, remaining: 3 })` where `held` is `wt\keep\a\held.txt`, a **file**; `worktree-manager.test.ts:858`, `:887` | ✅ **PASS** — probe **O2** (report the deepest *directory* instead) is killed by `:395` **alone** |
| **3b** `remaining` = the **recursive** count of **every entry** anywhere under the root | one number that separates all four readings | `dir-remover.test.ts:395` against a real-fs residue of exactly `keep`, `keep\a`, `keep\a\held.txt`. Measured this round: every-entry **3** ✅, directories-only **2** ❌, files-only **1** ❌, top-level-only **1** ❌, root-inclusive **4** ❌ | ✅ **PASS — round-2 gap N3 closed** |
| **3c** error message names `blockedPath`, states the count, says still-registered + retryable | four content assertions | `worktree-manager.test.ts:881-884`; singular form `:900-901` | ✅ PASS |
| **3d** `leftover` present **on the returned result itself** | the removal result carries it, not just the deleter | `:858` `toEqual({ blockedPath, remaining: 3 })`; `:886-888` `toEqual` + per-field | ✅ PASS (round-1 gap closed in R2) |
| **3e** guard refusals (primary / unregistered / locked / dirty) carry **no** `leftover` | absent on **all four** | dirty `:717`, primary `:737`, unregistered `:915`, locked `:944` — `expect(result.leftover).toBeUndefined()`. Each mutated **independently** this round; each kills exactly its own test | ✅ **PASS — round-2 gap N6 closed** (residual asymmetry **O5** on the *force* variants — non-blocking) |

| Other WRFT-04 ACs | `file:line` | Result |
| --- | --- | --- |
| AC 1 — retryable set, 250 ms spacing, `maxRetries: 0` | `dir-remover.test.ts:97-98`, `:108` `toEqual([0, 250, 500])`, `:166-169`, `:176-177` | ✅ PASS |
| AC 2 — lock clears within budget → proceed | `:97` | ✅ PASS |
| AC 3 — budget literal 3000 ms | `:121-122` | ✅ PASS |
| AC 4 — non-retryable reported immediately, budget untouched | `:132-135` | ✅ PASS |
| AC 5 — any failure returns within 5000 ms | `:350` | ✅ PASS |

### WRFT-05 — Terminated sessions really gone before deletion (`spec.md:305-312`)

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| 1 | PTY's real exit observed before deletion, or 3000 ms elapses | `session-manager.test.ts:374` `expect(settled).toBe(false)` at 2999 ms, `:376-378` resolves on `emitExit(0)` | ✅ PASS |
| 2 | no exit within the wait → proceed anyway | `:383` `expect(SESSION_EXIT_WAIT_MS).toBe(3000)` (literal, L-004), `:393-397` | ✅ PASS |
| 3 | late handle release absorbed by the WRFT-04 retry loop | no test with an outcome distinct from WRFT-04 AC 2 (`dir-remover.test.ts:97`) | ⚠️ **P3 / C1** — spec-precision, non-blocking |
| 4 | session-stop failure → removal aborted, error inline | `WorktreeDetail.tsx:173-179` — renderer convention-exempt (AD-004/AD-011) | ✅ convention-exempt |

### WRFT-06 — The failure is visible in the UI and the row stays

**Status unchanged from rounds 1 and 2 — a restatement, not a new finding.** The CDP smoke
(`scripts/smoke-remove.mjs:262-359`) is written, reads correctly and covers all four ACs by name, but
has **never been executed**: it needs the owner's live desktop session and is never run in CI. All four
ACs therefore have **no executed evidence**. The absence of *unit* tests here is convention-consistent
(`.specs/codebase/TESTING.md`, AD-004/AD-011) and correct. The producer→consumer wiring the smoke
exercises is statically present and pinned on the producer side (`shared/worktrees.ts:100-105`,
`:117`; `WorktreeDetail.tsx:135`, `:331-341`, `:320`). Discharged by the owner running
`node scripts/seed-smoke-remove.mjs` then `node scripts/smoke-remove.mjs`, plus the visual pass for
AC 4 — not by any change to this branch.

| Requirement | ACs | Result |
| --- | --- | --- |
| WRFT-01 | 6/6 | ✅ PASS (precision note P1 on AC 4/5) |
| WRFT-02 | 4/4 | ✅ PASS |
| WRFT-03 | 3/3 | ✅ PASS (layer note C2) |
| WRFT-04 | 5/5 (AC 3: **5/5 clauses**) | ✅ **PASS — both round-2 clauses closed** |
| WRFT-05 | 4/4 | ✅ PASS (AC 4 convention-exempt; AC 3 thin — C1/P3) |
| WRFT-06 | 0/4 executed | ⏳ Unverified — owner's live smoke (unchanged caveat) |

**22/22 assessed ACs (WRFT-01…05) match their spec-defined outcome; 4 unverified (WRFT-06);
3 spec-precision gaps open (P1, P3, P4) — all non-blocking.**

---

## Payload / Conjunction Rule

| Type | Field | Asserted on value/state? |
| --- | --- | --- |
| `DirRemovalResult` | `ok` / `code` | ✅ `:119-120`, `:132-133`, `:345-346` |
| `DirRemovalResult` | `leftover.blockedPath` | ✅ exact-value at `:148`, `:156`, `:347`, `:370`, `:395`; pinned to the **held file**, not an ancestor (probe O2) |
| `DirRemovalResult` | `leftover.remaining` | ✅ exact against the fake (`:148`, `:156`) **and** against real fs in two independent fixtures (`:370` dirs-only residue, `:395` mixed file+dir residue). Round-2 blind spot removed |
| `RemoveWorktreeResult` | `ok` / `error` | ✅ unchanged |
| `RemoveWorktreeResult` | **`leftover`** | ✅ asserted by value — `:858`, `:886-888` |
| `RemoveWorktreeResult` | `leftover` **absence** on refusal | ✅ **all four guards** — `:717`, `:737`, `:915`, `:944`; each independently load-bearing |

---

## Discrimination Sensor — Round 3

Mutations were applied to **scratch state only**: each production file was copied to the session
scratchpad before any edit, mutated in place by an exact-single-occurrence patcher, exercised with a
targeted `npx vitest run`, then restored from the copy. `git diff --quiet` was asserted after **every**
restore (all 15 reported `RESTORED-CLEAN`). No test file was ever modified.

### Re-run of round 2's two survivors — both genuinely killed

| # | File:line | Mutation | R2 | R3 | Observed failure |
| --- | --- | --- | --- | --- | --- |
| **N3** | `dir-remover.ts:53` | `remaining` counts **only directories** (`withFileTypes` + `isDirectory()`) | ❌ Survived | ✅ **Killed** | `1 failed \| 16 passed (17)` — `dir-remover.test.ts:395`, `- "remaining": 3 / + "remaining": 2` |
| **N6a** | `worktree-manager.ts:292-294` | **primary-checkout** guard returns `leftover: { blockedPath, remaining: 0 }` | ❌ Survived | ✅ **Killed** | `1 failed \| 79 passed (80)` — `:737` `expected { …(2) } to be undefined` |

### N3's sibling readings — the fixture separates all four, as claimed

| # | Mutation of `dir-remover.ts:53` | Killed? | Observed |
| --- | --- | --- | --- |
| **N4** | files-only (`isFile()`) | ✅ Killed | `2 failed \| 15 passed (17)` — `:370` `- 3 / + 0`, `:395` `- 3 / + 1` |
| **N5 / O1** | `remaining` counts the **worktree root itself** (`+1`) | ✅ Killed | `2 failed \| 15 passed (17)` — `:370` and `:395` both `- 3 / + 4` |
| **M13** | non-recursive (`readdir(path)`) | ✅ Killed | `2 failed \| 15 passed (17)` — `:370` and `:395` both `- 3 / + 1` |

Measured readings of the F3 fixture: **every-entry 3 / directories-only 2 / files-only 1 /
top-level-only 1 / root-inclusive 4** — four distinct wrong numbers, exactly as `1abe8aa` claimed.

### N6's siblings — each guard mutated independently

| # | Guard mutated (leftover attached to its refusal) | Killed? | Observed |
| --- | --- | --- | --- |
| **N6b** | **dirty** (`worktree-manager.ts:321-324`) | ✅ Killed | `1 failed \| 79 passed (80)` — `:717` |
| **N6c** | **unregistered** (`worktree-manager.ts:306`) | ✅ Killed | `1 failed \| 79 passed (80)` — `:915` |

Each of F4's three new assertions kills **its own** test and nothing else — they are individually
load-bearing, not collectively lucky.

### Regression re-check of earlier kills

| # | File:line | Mutation | Result | Observed failure |
| --- | --- | --- | --- | --- |
| **M1** | `worktree-manager.ts:330` | deletion-failure path falls through and calls `git worktree remove` anyway (**the central invariant**) | ✅ Killed | `3 failed \| 77 passed (80)` — `:855` `expected true to be false`, plus `:881` and `:900` |
| **M12** | `dir-remover.ts:50-54` | real deleter **follows junctions** (`statSync` walk instead of `fs.rm`) | ✅ Killed | `2 failed \| 15 passed (17)` — `ENOENT … shared\precious.txt`: the shared target really was destroyed, the exact AD-013 loss |
| **GO** | `worktree-manager.ts:291` | **guard order** — deletion hoisted ahead of every guard | ✅ Killed | `10 failed \| 70 passed (80)` — `:717`, `:727`, `:737`, `:783`, `:839`, `:916`, `:929`, `:945`, `:958`, `:970`; `deleter.calls` non-empty on five refusal paths |

### Fresh third-layer overfit probes (never run in rounds 1–2)

| # | File:line | Mutation | Killed? | Observed |
| --- | --- | --- | --- | --- |
| **O2** | `dir-remover.ts:86` | `blockedPath` reported as the deepest **directory** instead of the held file — scoped so it fires *only* when the blocked entry really is an existing file, leaving the fake-deleter tests untouched | ✅ **Killed** | `1 failed \| 16 passed (17)` — `:395` only: `- ".../keep/a/held.txt" / + ".../keep/a"`. F3 pins the held **file** on its own terms |
| **O3** | `dir-remover.ts:53` | real `readEntries` unreadable → `countEntries`' catch fires → `leftover` **present but `remaining: 0`** | ✅ **Killed** | `3 failed \| 14 passed (17)` — `:348` `expected 0 to be greater than or equal to 1`, `:370` and `:395` `- 3 / + 0`. Supersedes note C3 |
| **O4** | `dir-remover.ts:70/82/88` | retry loop reports the **first** failing attempt's path instead of the **last** | ❌ **SURVIVED** | `17 passed (17)` |
| **O5** | `worktree-manager.ts:292-294` | primary guard leaks `leftover` **only when `force: true`** | ❌ **SURVIVED** | `80 passed (80)` |
| **P1-msg** | `worktree-manager.ts:293`, `:323` | both guard messages gutted to bare fragments (`'primary checkout'`; `"N uncommitted changes — sort it out."`) | ❌ **SURVIVED** | `80 passed (80)` |

**Sensor depth**: P0-full. **Round-3 total: 15 mutations, 12 killed, 3 survived** — 2 re-runs of round-2
survivors, 5 re-runs of earlier kills (N4, N5/O1, M13, M1, M12), 1 guard-order mutation, 2 new
per-guard isolations (N6b, N6c), and **5 fresh third-layer probes** (O2, O3, O4, O5, P1-msg).

### Survivor analysis — all three non-blocking

**O4 — first-vs-last failing path is unpinned, and the spec does not choose.** With `fs.rm`'s partial
progress, attempt *n+1* can get further than attempt *n*, so the first attempt's `err.path` may name an
entry that has since been deleted. The current implementation reports the **last** attempt's path, which
is the correct reading of AC 3 ("the path of the entry that could not be deleted"); the mutant reports
the first and no test notices, because in every fixture the same entry blocks every attempt. Killing it
would need a two-holder fixture releasing in sequence mid-loop — expensive and inherently racy on
Windows, the same reason C1 is open. Recorded as spec-precision gap **P4** (AC 3 does not say *which
attempt's* entry) plus a test-strength note. **Impact if it ever regressed:** a stale path in one error
message in a multi-lock scenario; the count, the registration invariant and the retry are unaffected.
**NON-BLOCKING.**

**O5 — the three force-path guard tests carry no `leftover` assertion.** F4 correctly put
`expect(result.leftover).toBeUndefined()` on one test per guard, but the *force* variants —
`:780` primary-under-force, `:950` locked-under-force, `:962` bare-locked — assert only `ok`, `error`
and `deleter.calls`. (`:915` unregistered *does* run under force, so that guard is covered on both
paths.) A `leftover` conditioned on `opts.force` therefore slips through. WRFT-01 AC 6 says `force`
skips **only** the dirty check, so the two paths ought to be indistinguishable. No plausible
implementation branches a guard's payload on `force` — this is a contrived mutant, and the non-force
variant of every guard is pinned. **NON-BLOCKING**; a three-line fix if the owner wants symmetry.

**P1-msg — the guard message literals are not pinned, only their distinctive fragments.** Now
demonstrated rather than assumed: replacing the primary message with the literal string
`'primary checkout'` and the dirty message's tail with `— sort it out.` leaves all 80 tests green.
The *behaviour* the ACs are about (refuse, delete nothing, before any deletion) is fully pinned by
`:738`, `:718-719`, `:916`, `:945`; only the wording is loose, and the spec itself only says "the
unchanged DLWT-01 message" for AC 4. **NON-BLOCKING** — unchanged stance from rounds 1 and 2, and the
right call: pinning full literals would trade a real regression signal for churn on every copy edit.

---

## The `afterEach` change is inert with respect to assertions

`1abe8aa` added `maxRetries: 10, retryDelay: 100` to the cleanup `rmSync` in `dir-remover.test.ts`'s
shared `afterEach` (`:198-206`). Verified inert on four independent grounds:

1. **It is the commit's only deletion.** `git show --numstat 1abe8aa -- src/main/dir-remover.test.ts`
   reports **+52 / −1**, and the single removed line is
   `rmSync(root, { recursive: true, force: true })` — replaced by the retrying form. No assertion, no
   test, no timeout was touched.
2. **The hook contains no assertion.** `afterEach` is exactly a `stopHolder` loop plus one `rmSync`;
   there is no `expect()` in it, so it cannot pass or fail a criterion.
3. **It runs strictly after the test body.** It cannot alter state that an assertion already observed,
   and `root` is a fresh `mkdtempSync` per test (`:194`), so there is no cross-test coupling it could
   hide.
4. **Empirically demonstrated.** Eight mutations this round produced loud failures inside the very
   tests whose residue this hook cleans (`:348`, `:370`, `:395`) — the hook demonstrably does not
   swallow a failing expectation. Its only effect is the opposite one: it stops a *cleanup* EPERM,
   caused by Windows releasing a killed holder's handle asynchronously, from turning a passing test
   into a spurious failure.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ F3 and F4 are test-only; **no production line changed since round 1** (`dcc50dc..HEAD` = `*.test.ts` + `.specs/` only) |
| Surgical changes | ✅ F3 adds one test + a cleanup hardening; F4 adds three one-line assertions |
| No scope creep | ✅ WRFT-07 still correctly unbuilt |
| Only touched files required | ✅ two test files + `tasks.md`/`validation.md` |
| No test weakened or deleted | ✅ `+52/−1` and `+8/−0`; the one deletion is the `afterEach` cleanup line (see above). `:348`'s original `>= 1` retained alongside the two exact assertions — and probe O3 shows it still kills something |
| Matches existing patterns | ✅ real temp dirs, external holder processes, no `vi.mock`, explicit 30 s timeouts (L-005) |
| Tests map to ACs, non-shallow | ✅ both new tests carry their WRFT-04 AC 3 reference in a comment |
| Spec-anchored outcome check | ✅ 22/22 assessed ACs; 3 precision gaps flagged, not silently passed |
| Per-layer Coverage Expectation | ✅ domain logic 1:1 with ACs; renderer exempt by AD-004/AD-011 |
| No unclaimed tests | ✅ all 33 new tests map to a WRFT AC or a listed Edge Case |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, AD-005, lessons L-001/L-004/L-005 |

---

## Edge Cases (from `spec.md` §Edge Cases)

- [x] Concurrent double-remove is idempotent — `dir-remover.test.ts:84-85`, `worktree-manager.test.ts:803-804`
- [x] Read-only files / nested repo with a `0444` object store — `dir-remover.test.ts:311-312`, `:330-331`
- [x] Repo gone or git unavailable → fail closed — `worktree-manager.test.ts:920-931`
- [x] Paths with spaces / non-ASCII — unchanged `execFile` discipline
- [ ] Detached-HEAD worktree removal — **no located test** (low behavioural risk, no evidence)
- [ ] Path > 260 chars — **no located test**; the spec marks it "not probed" under Assumptions, a knowing omission

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Full gate, `tasks.md` §Gate Check Commands) — **run by this Verifier**, exit code **0**
- **Result**: **566 passed, 0 failed, 0 skipped** — **40 test files**
  - `typecheck`: clean (node + web projects)
  - `lint`: **0 errors, 18 warnings** — all `prettier/prettier` in `scripts/fixtures/implement-ticket/workflow.ts`, `scripts/smoke-agent-config.mjs`, `scripts/smoke-agents.mjs`; none in any file this diff touches. Pre-existing
  - `test`: 78.18 s wall (tests 132.32 s across workers)
- **Test count before feature**: 533 tests / 39 files (post-T0 baseline)
- **Round 1 → 2 → 3**: 564 → 565 → **566** tests / 40 files. F3 adds one real-fs test; F4 adds assertions to existing tests, so it moves no count
- **Delta vs. pre-feature**: **+33 tests, +1 file, zero deletions** — the DLWT/FRWT regression set is intact
- **Skipped tests**: none. **Failures**: none.
- **Manual gate**: `node scripts/smoke-remove.mjs` — **NOT RUN** (needs a live desktop session; owner-run)

---

## Working Tree Check

- Every one of the 15 mutations ran against a scratchpad copy
  (`…/scratchpad/backup/{dir-remover,worktree-manager}.ts`), restored by `cp` immediately after the
  run, with `git diff --quiet <file>` asserted after each restore — **all 15 reported `RESTORED-CLEAN`**.
- No test file was ever modified, by mutation or otherwise.
- Final `git status --short`: **`M .specs/features/worktree-removal-fault-tolerance/validation.md`
  only** — the tree is clean apart from this report.

---

## Fix Plans

**No fix task is proposed.** All three surviving mutants are non-blocking (see §Survivor analysis), and
this was the final permitted iteration — they are handed to the owner as a decision, not looped back.
For completeness, the cheapest form of each, should the owner want it in a follow-up:

### Optional 1 — `O5`: assert `leftover` absence on the force-path guard tests — Minor
Add `expect(result.leftover).toBeUndefined()` to `worktree-manager.test.ts:780` (primary under force),
`:950` (locked under force) and `:962` (bare-locked). Verify by re-running O5.

### Optional 2 — `O4 / P4`: say which attempt's path `blockedPath` names — Minor
Amend `spec.md:279-280` to "the entry that blocked the **final** attempt", then either accept it as
spec-pinned-only or add a two-holder mid-loop fixture. The fixture is racy; the spec amendment alone is
probably the better trade.

### Optional 3 — `P1`: pin the guard message literals — Cosmetic
Deliberately **not** recommended: full-literal assertions would churn on every copy edit while the
behavioural assertions already carry the regression signal.

### Carried forward (not fix tasks)
- **P3 / C1** — WRFT-05 AC 3 has no observable outcome distinct from WRFT-04 AC 2; spec finding F's
  "holder exits mid-loop" self-heal is unreplicated. Unchanged from rounds 1 and 2.
- **C2** — WRFT-03 asserted one layer below `removeWorktree`, bridged by the default-deps test.
- **WRFT-06** — owner's live smoke + visual pass. Unchanged caveat, not a finding.

---

## Spec-Precision Gaps

- **P1** — ⏳ open, **non-blocking**. WRFT-01 AC 4/5 name/quote the message literals; tests pin the
  distinctive fragment. Now *evidenced* (P1-msg probe survived) rather than assumed, and the stance is
  unchanged: the behaviour is pinned, only the wording is loose.
- **P2** — ✅ closed by `6f3af8a`. The amendment raised the bar to "every entry", and `1abe8aa` now
  meets it.
- **P3** — ⏳ open, **non-blocking**. WRFT-05 AC 3 says the retry loop "SHALL absorb the delay" without
  an observable outcome distinct from WRFT-04 AC 2.
- **P4** — ⏳ **new, non-blocking**. WRFT-04 AC 3 says `blockedPath` is "the path of the entry that
  could not be deleted" without saying *which attempt's* entry, so first-vs-last is spec-undefined
  (probe O4).

## Coverage Notes

- **C1** — unchanged: no test reproduces spec finding F's "holder exits at 600 ms → OK" row with a real
  process exiting *mid-loop*.
- **C2** — unchanged: WRFT-03 is asserted one layer below `removeWorktree`, bridged by the default-deps
  test at `worktree-manager.test.ts:699-705`.
- **C3** — ✅ **superseded**. Round 2 recorded `dir-remover.test.ts:348`'s `toBeGreaterThanOrEqual(1)`
  as discriminating nothing; probe O3 shows it does kill a `remaining: 0` regression. It is weak, not
  inert, and it is now redundant beside `:370`/`:395` rather than misleading.

---

## Requirement Traceability Update

| Requirement | R1 | R2 | R3 (final) |
| --- | --- | --- | --- |
| WRFT-01 | ✅ Verified | ✅ Verified | ✅ **Verified** (P1 non-blocking) |
| WRFT-02 | ✅ Verified | ✅ Verified | ✅ **Verified** — invariant re-confirmed (M1 killed) |
| WRFT-03 | ✅ Verified | ✅ Verified | ✅ **Verified** — junction safety re-confirmed (M12 killed) |
| WRFT-04 | ❌ Needs Fix (3c, 3e) | ❌ Needs Fix (3b, 3e) | ✅ **Verified** — all five clauses of AC 3 pinned |
| WRFT-05 | ✅ Verified | ✅ Verified | ✅ **Verified** (AC 4 convention-exempt; AC 3 thin — C1/P3) |
| WRFT-06 | ⏳ Unverified | ⏳ Unverified | ⏳ **Unverified** — blocked on the owner's live smoke + visual pass |
| WRFT-07 | ⏸ Deferred | ⏸ Deferred | ⏸ **Deferred** (AD-014) — out of scope, not assessed |

---

## Summary

**Overall**: ✅ **Ready to merge**, with WRFT-06 outstanding on the owner and three non-blocking
residuals recorded.

**Findings**: 12 raised across three rounds — **6 closed** (M6, M13, N3, N6, P2, C3), **6 open**
(P1, P3, C1, C2, O4/P4, O5), **all six non-blocking**; 1 unchanged caveat (WRFT-06).
**Spec-anchored check**: **22/22** assessed ACs (WRFT-01…05) match their spec-defined outcome;
**3 spec-precision gaps** open (P1, P3, P4); **4 criteria unverified** pending the owner's smoke.
**Sensor**: **15 mutations, 12 killed, 3 survived** — including 5 fresh third-layer overfit probes.
**Gate**: 566 passed, 0 failed, 0 skipped; typecheck clean; lint 0 errors / 18 pre-existing warnings; exit 0.
**Working tree**: clean apart from this file.

**What round 3 verified independently** — re-derived, not taken on the fix worker's word:
- **N3 is genuinely dead.** F3's fixture separates all four readings with real measured numbers, not a
  claim: every-entry 3, directories-only 2, files-only 1, top-level 1, root-inclusive 4. Four distinct
  mutations, four distinct failures.
- **N6 is genuinely dead, per guard.** Mutating the primary, dirty and unregistered refusals
  *separately* fails exactly one test each — so all three of F4's assertions are load-bearing
  individually, not collectively lucky.
- **The fixes bought more than they were asked for.** Probe O2 shows F3 also pins `blockedPath` to the
  held **file** rather than its parent directory — a mutation nothing else in the suite catches — and
  probe O3 shows the real `readdir` wiring is pinned against silently reporting zero.
- **Nothing regressed.** The central invariant (M1: never call git after a failed deletion), the
  junction-safety guarantee (M12: the AD-013 data-loss path), and guard ordering (deletion hoisted above
  the guards → 10 failures) are all still killed hard.
- **The `afterEach` hardening is inert.** One deleted line, no assertion in the hook, and eight
  mutations this round still failed loudly inside the very tests it cleans up after.

**What still survives** (ranked; none blocks merging):
1. **O5** — a guard `leftover` conditioned on `force: true` passes, because the three force-path guard
   tests assert no `leftover`. Contrived mutant; every guard is pinned on its non-force path.
   **NON-BLOCKING.**
2. **O4 / P4** — `blockedPath` naming the *first* rather than the *last* failing attempt passes; the
   spec does not say which, and a discriminating fixture would be racy. **NON-BLOCKING.**
3. **P1** — the guard message literals can be gutted with the suite green; the behaviour they guard is
   fully pinned. Unchanged stance, now evidenced. **NON-BLOCKING.**
4. **WRFT-06 still has no executed evidence** — unchanged caveat, not a finding, and dischargeable only
   by the owner.

**Next steps**:
1. Merge is not blocked by any item above.
2. Owner runs `node scripts/seed-smoke-remove.mjs` then `node scripts/smoke-remove.mjs` against a live
   session to discharge WRFT-06, plus the visual pass for AC 4. Until then WRFT-06 stays ⏳ Unverified.
3. Optionally fold Optional 1 (three assertions) and Optional 2 (one spec sentence) into the WRFT-07
   follow-up PR.

**Lesson distillation**: not performed by this Verifier — the round-3 assignment restricts its only
write to this file, and `scripts/lessons.py` mutates `lessons.json`/`LESSONS.md`. There **is** signal
worth recording, and the orchestrator should distill it:
- *A fixture built to kill one named mutant is blind to that mutant's siblings.* Rounds 1→2→3 walked
  M13 → N3 → (O2, O4): each fix pinned exactly the reading it was shown and left the neighbouring
  readings free. The durable countermeasure is the one F3 finally applied — **choose a fixture whose
  single observed number separates every plausible reading at once**, and state the separation in the
  test's comment so the next reader can check it.
- *A contract clause that names N call sites needs N assertions.* AC 3e named four guards; asserting one
  looked like coverage for two rounds. Enumerate the clause's call sites and assert each.
- *Verify a "cleanup-only" test-harness change is inert before accepting it* — cheapest proof is that an
  injected fault still fails loudly in the tests that hook serves.
