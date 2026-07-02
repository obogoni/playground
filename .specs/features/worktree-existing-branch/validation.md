# Reuse or Recreate an Existing Branch on Worktree Create — Validation

**Date**: 2026-07-02
**Spec**: `.specs/features/worktree-existing-branch/spec.md`
**Diff range**: `72976952abb48c70e658509392a96d9e64cb597b..a558933ec86088472f042b040cd3230d6f6eaefd` (`main..HEAD`, 3 commits: spec doc, backend, UI)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| Backend: pre-flight detection + reuse/recreate modes (`worktree-manager.ts`) | ✅ Done | `resolveExistingBranch`/`branchExists`/`addWorktree` helpers |
| Shared: `CreateWorktreeResult.conflict` + IPC `onExisting` + `index.ts` threading | ✅ Done | typecheck-verified; `index.ts:105-106` threads `onExisting` |
| UI: `BranchExistsChoice` + wiring into both create dialogs | ✅ Done | renderer, no unit tests by convention (AD-004) — wiring inspected |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| EXB-01 — base supplied, `onExisting` absent, branch exists → conflict, no mutation | `{ ok: false, conflict: 'branch-exists' }`, no `error`, no folder, branch tip unchanged, still 1 worktree | `worktree-manager.test.ts:357` — `expect(result).toEqual({ ok: false, conflict: 'branch-exists' })`; `:358` `error).toBeUndefined()`; `:360` `existsSync(...).toBe(false)`; `:361` `toHaveLength(1)`; `:362` `headOf('feature/dupe')).toBe(tipBefore)` | ✅ PASS |
| EXB-01 — branch does NOT exist → create proceeds as today | `{ ok: true, path }`, worktree on new branch | `worktree-manager.test.ts:270` — `toMatchObject({ ok: true, path: ... })`; `:273` `toContainEqual(...branch: 'feature/abc')` | ✅ PASS |
| EXB-02 — `onExisting: 'reuse'` → checkout existing branch at its tip, base/updateBase ignored | new worktree carries existing branch's commit (`reuse-content`), NOT base's `one`; branch = `feature/reuse` | `worktree-manager.test.ts:370` — `ok).toBe(true)`; `:372` `readFileSync(...a.txt).toBe('reuse-content')`; `:374` `listed?.branch).toBe('feature/reuse')` | ✅ PASS |
| EXB-03 — `onExisting: 'recreate'` → force-delete + recut from base | content = base's `one`; branch head = main's head; old unique commit gone | `worktree-manager.test.ts:385` — `readFileSync(...).toBe('one')`; `:386` `headOf('feature/re')).toBe(headOf('main'))`; `:388` `not.toBe(oldTip)` | ✅ PASS |
| EXB-03 (WBR interaction) — recreate + updateBase → base refreshed first, then recut from remote tip | local main = origin/main; recut content = `two` (remote), not `stale` | `worktree-manager.test.ts:577` — `headOf(repo,'main')).toBe(headOf(repo,'origin/main'))`; `:579` `readFileSync(...).toBe('two')` | ✅ PASS |
| EXB-04 — branch checked out elsewhere → error naming host, no conflict | `{ ok: false, error }` containing host path; `conflict` undefined; no folder | `worktree-manager.test.ts:397` `ok).toBe(false)`; `:398` `conflict).toBeUndefined()`; `:399` `error).toContain(live)`; `:400` no folder | ✅ PASS |
| EXB-04 — reuse re-invoke against checked-out branch → same error, not raw git failure | `{ ok: false, error }` containing host; `conflict` undefined | `worktree-manager.test.ts:409-411` — `ok).toBe(false)`, `conflict).toBeUndefined()`, `error).toContain(live)` | ✅ PASS (recreate re-invoke not separately tested — same pre-branch guard; see note) |
| EXB-05 — IPC carries mode + conflict signal; index.ts threads onExisting | `onExisting?: 'reuse'\|'recreate'` req field; `conflict?: 'branch-exists'` result variant; threaded in main | typecheck (`ipc-contract.ts:44`, `worktrees.ts:65`); `index.ts:105-106` threads `onExisting`; conflict shape asserted at `test.ts:357` | ✅ PASS (structural — typecheck + wiring read) |
| EXB-06 — inline choice UI in both dialogs | conflict → `<BranchExistsChoice>` swaps footer; Reuse primary/focused; recreate danger; Cancel clears; busy disables | `NewWorktreeDialog.tsx:190-197` + `StartWorkDialog.tsx:221-228` render on `conflict`; `BranchExistsChoice.tsx:46-54` Reuse `autoFocus`/primary, `:43` danger recreate, `:40` Cancel; buttons `disabled={busy}` | ✅ PASS (no renderer unit tests per AD-004 — wiring inspected, correct) |
| EXB-D8 — recreate refreshes base before delete; refresh failure preserves branch | `{ ok: false }` diverged error; branch tip = `tipBefore` (preserved); no folder | `worktree-manager.test.ts:592` `ok).toBe(false)`; `:593` `error).toMatch(/diverged\|fast-forward/i)`; `:595` `headOf(repo,'feature/re')).toBe(tipBefore)`; `:596` no folder | ✅ PASS |
| Verification bullet — target-path guard short-circuits before branch check | path guard wins over branch-exists; `conflict` undefined | `worktree-manager.test.ts:421` `ok).toBe(false)`; `:422` `error).toMatch(/exists/i)`; `:423` `conflict).toBeUndefined()` | ✅ PASS |

**Status**: ✅ All ACs covered (10/10 including EXB-D8). No unclaimed tests; every EXB/WBR-delta test maps to a spec requirement.

---

## Discrimination Sensor

Scratch strategy: tree was clean; each mutation applied via `Edit`, run against the covering test(s), then reverted with `git checkout -- src/main/worktree-manager.ts` (verified clean after each).

| # | File:line | Description | Covering test | Killed? |
| - | --------- | ----------- | ------------- | ------- |
| 1 | `worktree-manager.ts:129` | Flip `if (hosting)` → `if (!hosting)` (EXB-04 host guard) | `-t "existing branch"` | ✅ Killed (5 failed / 2 passed) |
| 2 | `worktree-manager.ts:138` | reuse add uses `-b` (`['worktree','add',target,'-b',branch]`) — EXB-02 | `-t "existing branch"` | ✅ Killed (1 failed) |
| 3 | `worktree-manager.ts:142-144` | Drop pre-delete refresh guard (`if (!refreshed.ok) return`) — EXB-D8 | `-t "recreate"` | ✅ Killed (1 failed — "recreate preserves the branch…") |

**Sensor depth**: lightweight (3 behavior-level mutations on the highest-risk new code)
**Result**: 3/3 killed — PASS ✅
**Post-sensor state**: `git status` clean, `git diff` empty on source file — restored.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ |
| No scope creep | ✅ (out-of-scope items respected: no commit-count, no `-d` fallback, no rebase, empty-base path untouched) |
| Matches patterns | ✅ (reuses `addWorktree`/`gitFailureLine`/`refreshBaseFromRemote`/`worktreeHosting`; execFile seam; failures returned not thrown) |
| Spec-anchored outcome check | ✅ (asserted values match spec) |
| Per-layer coverage (domain 1:1 ACs) | ✅ |
| Every test maps to a requirement — no unclaimed tests | ✅ |
| Documented guidelines followed | AD-004 (no renderer unit tests) — respected; strong defaults otherwise |

**Notes:**
- `resolveExistingBranch` returns `CreateWorktreeResult | null` where `null` is never actually returned on this path; the code comment (`worktree-manager.ts:112-117`) documents it as a deliberate "not my concern" readability signal. Harmless, not a defect.
- Renderer wiring (both dialogs) verified correct: first `submit()` sends no mode; `if (!onExisting && result.conflict === 'branch-exists')` gates the swap to `BranchExistsChoice`; reuse/recreate re-invoke with a mode (never re-prompts, since the backend never returns `conflict` when `onExisting` is set); `busy` disables the choice buttons; Cancel clears `conflict`; ordinary errors (incl. EXB-04) fall to the `dialog-error` slot and keep the dialog open.

---

## Edge Cases

- [x] Branch exists, not checked out, no mode → conflict, nothing mutated
- [x] Reuse ignores stale base / updateBase
- [x] Recreate + updateBase refreshes base first, recuts from remote tip
- [x] Recreate refresh failure preserves the branch (EXB-D8)
- [x] Checked-out-elsewhere → plain error (no conflict), for detect and reuse re-invoke
- [x] Target-path guard and empty-template guard short-circuit before branch check

---

## Gate Check

- **Gate commands**: `npm run typecheck`, `npm run lint`, `npx vitest run src/main/worktree-manager.test.ts`
- **typecheck**: ✅ pass (node + web projects, no errors)
- **lint**: ✅ 0 errors, 17 warnings (all pre-existing `prettier/prettier` in `scripts/smoke-*.mjs` — acceptable, unrelated to this feature)
- **tests**: 66 passed, 0 failed, 0 skipped
- **Test count before feature**: 58
- **Test count after feature**: 66
- **Delta**: +8 (6 in new `createWorktree — existing branch (EXB)` describe + 2 in WBR describe: recreate-refresh & recreate-preserve)
- **Failures**: none

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| EXB-01 | Implementing | ✅ Verified |
| EXB-02 | Implementing | ✅ Verified |
| EXB-03 | Implementing | ✅ Verified |
| EXB-04 | Implementing | ✅ Verified |
| EXB-05 | Implementing | ✅ Verified (structural: typecheck + wiring) |
| EXB-06 | Implementing | ✅ Verified (wiring inspected; renderer untested per AD-004) |
| EXB-D8 | Implementing | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 10/10 ACs matched spec outcome (0 spec-precision gaps that fail)
**Sensor**: 3/3 mutations killed
**Gate**: 66 passed, 0 failed (+8 vs pre-feature 58); typecheck + lint clean

**What works**: pre-flight detection returns a distinct conflict signal without mutating anything; reuse checks out the existing branch as-is; recreate force-deletes and recuts from a (refreshed) base; a refresh failure on the recreate path preserves the branch (EXB-D8); checked-out-elsewhere yields a plain error for both detect and re-invoke; guards ordered correctly. UI wiring in both dialogs is correct.

**Issues found**: none blocking. Minor: (1) EXB-04 recreate re-invoke against a checked-out branch is not covered by its own test — the reuse re-invoke test at `:403` exercises the same pre-branching host guard, so behavior is covered but not named separately. (2) EXB-04 error assertion uses `toContain(live)` (host path) rather than the exact message string — spec wording is `e.g.`, so acceptable.

**Next steps**: none required. Feature passes validation.
