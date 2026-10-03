# Branch Slug Short Validation

**Date**: 2026-10-03
**Spec**: `.specs/features/branch-slug-short/spec.md` (as amended at Execute on 2026-10-03: `via` in the filler list, BSLG-37/38 retargeted, BSLG-39 narrowed)
**Diff range**: `6d96ae4..e61d72a` (branch `feature/branch-slug-short`; `6d96ae4` = `origin/main`, the first two commits on top are the plan)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

## Validation: branch-slug-short — PASS

The production code is correct on every criterion I could test, and every AC and edge case has a `file:line`
assertion on the value the spec defines. The gate is green: 2620 tests, lint 0 errors / 18 warnings (the
baseline), build exit 0.

The sensor killed 47 of 53 mutants. The six that survived all sit in test code or smoke, not in production:

- **W3, W4.** `createWorktree`'s Recreate path has no test on a branch git can see, so two things go
  untested: that the check runs before `branch -D`, and that `onExisting` reaches the check. At HEAD the code
  is correct. A scratch probe test kills both mutants.
- **S11, C1.** Two cheap unit gaps.
- **SM-A, SM-D.** Two smoke gaps in `usePathCheck`'s wiring.

Under the owner's budget for this round, these are follow-ups, not a fix round: production code is correct and
no AC is without evidence. Follow-up 1 is ranked first because it guards against losing a branch.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T17 | ✅ Done | — |
| T18 | ⚠️ Done, one box open | Checks 8–9 are written but not run, because `SMOKE_LONG_TASK_URL` is deliberately unset. The owner made the section optional. The proof for BSLG-08/10 is T2's unit tests. Recorded as follow-up 5 |

---

## Spec-Anchored Acceptance Criteria

Test paths are relative to the repository. "Smoke N" is check N of `scripts/smoke-start-work.mjs`
(`SMOKE_ONLY=longpath`), re-run here at HEAD: 7/7.

### P1: Concise slugs

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| BSLG-01 | each of the 29 fillers left out, after transliteration and lowercasing | `src/shared/tasks.test.ts:159-160` `it.each(FILLER_WORDS)` → `toBe('feature/7-fix-login')`. The list at `:124-154` is the spec's 29 words, `via` included. `:164-165` `slug('Fix À login')`/`'Fix DE login'` → `'fix-login'`. `:169` look-alikes kept | ✅ (S1, S2, S10 killed) |
| BSLG-02 | `Fix fix login`→`fix-login`; `Validação de validação`→`validacao` | `src/shared/tasks.test.ts:173` `slug('Fix fix FIX login')` → `'fix-login'`; `:174` → `'validacao'` | ✅ (S3, S4 killed) |
| BSLG-03 | `…recorrente via bancos` → `revisar-fluxo-pagamento-recorrente` (34) | `src/shared/tasks.test.ts:188-190` exact string | ✅ (S5, S9 killed) |
| BSLG-04 | `…recorrente via banco` → `revisar-fluxo-pagamento-recorrente-banco` (40) | `src/shared/tasks.test.ts:182-184` exact string | ✅ (S5, S6 killed) |
| BSLG-05 | first word > 40 → its first 40 characters | `src/shared/tasks.test.ts:201-203` → `'supercalifragilisticexpialidociousextrao'` (40) | ✅ (S7 killed) |
| BSLG-06 | filler-only title → all words, with AC 2, 3, 5 applied (`De a para` → `de-a-para`) | `src/shared/tasks.test.ts:207` `slug('De a para')` → `'de-a-para'`. `:208-210` fallback capped at 38 characters | ⚠️ The AC 2 part (repeat collapse inside the fallback) has no assertion, and S11 survived. Follow-up 2 |
| BSLG-07 | `Migrar para v2 em 3 etapas` → `migrar-v2-3-etapas` | `src/shared/tasks.test.ts:214` exact string | ✅ |
| BSLG-08 | AC 8 title → `ajustar-validacao-campos-cadastro` | `src/shared/tasks.test.ts:191` exact string. `:222-230` nested template gives both slugs | ✅ |
| BSLG-09 | `{type}`, `{id}`, `{dev}`, `{usId}`, literal text and trimming unchanged | `src/shared/tasks.test.ts:233` literal `de/` kept; `:234-239` `devAlias: 'of'` kept → `'user/of/10001-checkout-flow/10002-fix-login'`; `:240` `bugfix/10002-fix-login`; `:218` trimming | ✅ |
| BSLG-10 | id read back for long, filler-only and empty titles | `src/shared/tasks.test.ts:364-401`: round trip over 8 templates × 5 titles (AC 8, `De a para`, `!!!`, a 49-letter word) × 2 types × 4 contexts, `toEqual({… id: 4821})` | ✅ |
| BSLG-11 | `feature/4821-configuracao-de-ambiente` → 4821 | `src/shared/tasks.test.ts:290-292` (`taskIdFromBranch`), `:353-357` (`taskIdFromTemplate`) | ✅ |

### P1: Git's real error

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| BSLG-12 | first line that starts with `fatal:`/`error:` after trimming, trimmed | `src/main/git.test.ts:37-42` progress note then fatal → the `fatal:` line; `:44-46` → `'error: b'`; `:57-59` → `'fatal: z'` (trimmed); `:73-83` real git rev-parse/checkout failures | ✅ (G1, G3, G5 killed) |
| BSLG-13 | no prefixed line → first non-empty line; no stderr → message's first line | `src/main/git.test.ts:18-23`, `:25-28` (pre-existing, still green) | ✅ (G5 killed) |
| BSLG-14 | create returns git's `fatal:` line; dialog shows it | `src/main/worktree-manager.test.ts:515-524`: the error starts with `fatal: cannot lock ref 'refs/heads/user/x'` and does not contain `Preparing worktree`. Smoke 5 (dialog): `startsWith("fatal: cannot lock ref 'refs/heads/team/77-x'")` | ✅ |
| BSLG-15 | sync, Files, diffs, commits, discard, create/remove all go through `gitFailureLine`; no second extractor | `src/main/git-sync.ts:70` (the old `errorLine` is removed); `src/main/git-sync.test.ts:301` diverged pull → `'fatal: Not possible to fast-forward, aborting.'`. Grep: no other stderr line extractor in `src/main` (the `worktree-manager.ts:258` regex only classifies, then returns `gitFailureLine` at `:262`) | ✅ (G7 killed) |
| BSLG-16 | `git failed in {repoPath}: {gitFailureLine}` | `src/main/worktree-manager.test.ts:122-133`: prefix `git failed in ${plain}: fatal: not a git repository` | ✅ (G6 killed) |
| BSLG-43 | `error:` before `fatal:` → the `error:` line | `src/main/git.test.ts:48-50` → `'error: a'` | ✅ (G4 killed) |
| BSLG-44 | `hint: fatal: …` never picked | `src/main/git.test.ts:52-55` → `'hint: fatal: x'` on its own, and `'fatal: y'` when one follows | ✅ (G2 killed) |

### P1: Check before creating

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| BSLG-17 | ≥260 → exact AC 17 text with `{n}` | `src/main/path-limits.test.ts:16-17` holds the literal message. `:64-70` (260, 287). `:315-324` real repo, 270. Smoke 1: 287 in the dialog | ✅ (P2, P16 killed) |
| BSLG-18 | reflog ≥248 with ref ≤259 → exact reflog text | `src/main/path-limits.test.ts:83-87` 248 (ref 251) → `reflogMessage(248)`. `:423-432` real repo, Recreate | ✅ (P4 killed) |
| BSLG-19 | ref ≤259 and reflog ≤247 → no message | `src/main/path-limits.test.ts:58-62`, `:74-81` → `toBeNull()`. Smoke 2: 259 → `line === null` | ✅ (P1, P3 killed) |
| BSLG-20 | path message → Create disabled | Smoke 1 and 2: `createDisabled === true`. The T17 notes record smoke 1/2/6 failing on a `canCreate` mutant. Code: `NewWorktreeDialog.tsx:89-90`, `StartWorkDialog.tsx:140-141` | ✅ for New worktree; Start Work is code-only (follow-up 5) |
| BSLG-21 | `core.longpaths` true → no AC 17–18 message, Create enabled | `src/main/path-limits.test.ts:104-109` (pure); `:326-338` real repo, `true` and `yes`. `src/main/worktree-manager.test.ts:747-757` creates a 270 ref path. Smoke 3 | ✅ (P10, C3, C4 killed) |
| BSLG-22 | not Windows → no path check | `src/main/path-limits.test.ts:297-313`: `linux` → `null`, `calls` `toEqual([])` | ✅ (C2 killed). Only `linux` is tested, and C1 survived. Follow-up 3 |
| BSLG-23 | re-ask 250 ms after the last change of branch, repo or template; show only the answer for the current values | `src/renderer/src/lib/path-check.test.ts:16-17` `PATH_CHECK_DELAY_MS` `toBe(250)`; `:26-33` key changes with each of the four values. Smoke 2 re-asks on a branch change. Code: `use-path-check.ts:48-66` | ⚠️ Branch change is proven. Repo change goes undetected: SM-D survived smoke 3. Template change is code-only. Follow-up 4 |
| BSLG-24 | prefilled and hand-typed names, both dialogs | Smoke 1: a hand-typed name in New worktree. Start Work's prefill is code-only (`StartWorkDialog.tsx:127-138`). Smoke 8–9 are written but not run (owner-optional) | ⚠️ Partial. Follow-up 5 (recorded owner decision) |
| BSLG-25 | `{ ok: false, error }` with the same message, before any git write; nothing left behind | `src/main/worktree-manager.test.ts:705-716`: `toEqual({ ok: false, error: refMessage(260) })`, no folder, no branch, 1 worktree. `:718-734` refused before the base refresh (W2 killed). Smoke 4 | ✅ for "no refresh" and "no add" (W1, W2 killed). ⚠️ "No branch delete" is untested: W3/W4 survived. Follow-up 1 |
| BSLG-26 | never writes `core.longpaths` and never passes it with `-c` | Grep of `src/` outside tests: only `config --type=bool --get` at `src/main/path-limits.ts:108`, and no `'-c'` anywhere. `src/main/worktree-manager.test.ts:690-692` `expectLongPaths` is asserted after every path-check create (`:716`, `:734`, `:745`, `:757`, `:772`, `:790`, `:805`, `:829`) | ✅ |

### P2: Folder check

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| BSLG-27 | folder ≥216 → exact text, whatever `core.longpaths` holds | `src/main/path-limits.test.ts:141-142` (literal message); `:152-176` 215 passes, 216 refused under both `longPaths` values and both `writesRef` values. Smoke 6 (230) | ✅ (P5, P6, P13 killed) |
| BSLG-28 | git folder ≥248 with `core.longpaths` off → exact text | `src/main/path-limits.test.ts:143-144`; `:190-214` 247 passes, 248 refused (even with `writesRef` false), lifted by `longPaths` | ✅ (P7, P8, P12 killed) |
| BSLG-29 | order: ref, reflog, folder, git folder | `src/main/path-limits.test.ts:118-122` (ref before reflog); `:217-240` (ref, then reflog, then folder, then git folder) | ✅ (P14 killed) |
| BSLG-30 | create refused as in AC 25 with that message | `src/main/worktree-manager.test.ts:792-805`: `toEqual({ ok: false, error: folderMessage(216) })`, nothing created. Smoke 7 | ✅ |

### Edge cases

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| BSLG-31 | `!!!` → `feature/4821` | `src/shared/tasks.test.ts:217-218` | ✅ |
| BSLG-32 | 40-letter word kept; 41 → first 40 | `src/shared/tasks.test.ts:194-198` | ✅ (S7 killed) |
| BSLG-33 | `login fix login` kept | `src/shared/tasks.test.ts:177-178` | ✅ |
| BSLG-34 | no `/` → ref rule only | `src/main/path-limits.test.ts:90-100` | ✅ (P11 killed) |
| BSLG-35 | 259 passes, 260 refused | `src/main/path-limits.test.ts:58-66`, `:126-138` (each separator form); `src/main/worktree-manager.test.ts:705-716` (260 refused), `:736-745` (259 created) | ✅ (P1, P2 killed) |
| BSLG-36 | 247 passes, 248 refused | `src/main/path-limits.test.ts:74-87` | ✅ (P3, P4 killed) |
| BSLG-37 | existing local branch checked out as it is → not refused | `src/main/path-limits.test.ts:391-421` (no base, Reuse, base with no choice yet → `null`); `src/main/worktree-manager.test.ts:775-790` Reuse succeeds on the M2-shaped branch | ✅ (P9, C5, C7 killed) |
| BSLG-38 | Recreate of a ref-path-refused name → AC 17 message, branch still exists | `src/main/worktree-manager.test.ts:759-773`: `toEqual({ ok: false, error: refMessage(270) })`, and the tip is unchanged | ✅ against the text as written. ⚠️ Spec-precision gap: git cannot see a branch with a 270 ref path when `core.longpaths` is off (re-measured here: packed, still invisible). The create therefore never enters the Recreate fork, and the case cannot fail on check placement (W3/W4 survive it). Follow-up 1 |
| BSLG-39 | non-boolean value: check → no message; create → `fatal: bad boolean config value …` | `src/main/path-limits.test.ts:340-358` (git refuses → `null`); `src/main/worktree-manager.test.ts:807-829` (error starts with `fatal: bad boolean config value`, no folder) | ✅ (C8 killed) |
| BSLG-40 | global true + repository false → refused | `src/main/path-limits.test.ts:360-374` → `refMessage(270)` | ✅ (C4 killed) |
| BSLG-41 | unreadable repository → no message; git's own error | `src/main/path-limits.test.ts:446-456`: not a repository → `null` | ✅ for "not a repository". The "git missing" arm has no test (same `catch`). Follow-up 6 |
| BSLG-42 | answer for a name no longer shown → ignored | `src/renderer/src/lib/path-check.test.ts:59-62` `problemFor(stale…)` → `null` | ✅ for the pure decision (K1 killed). ⚠️ The hook wiring is unproven: SM-A (the hook ignores the key) passed smoke 1–7. Follow-up 4 |

**Status**: every AC and edge case has at least one spec-valued assertion. Four ⚠️ partials (BSLG-06, BSLG-23,
BSLG-24, BSLG-25's branch-delete clause) and one spec-precision gap (BSLG-38) are recorded as follow-ups.

---

## Discrimination Sensor

The sensor ran in a temporary `git worktree add --detach` outside the repository, with a directory junction to
the real `node_modules`. A Python runner applied each mutant to one anchor (asserting exactly one match), ran the
named test files, and restored the original in `finally`. Afterwards I removed the junction first, then the
worktree. The real tree's `git status --porcelain` was empty before and is empty after.

### Unit mutants (51 injected, 47 killed, 4 survived)

| ID | File:line | Mutation | Outcome |
| -- | --------- | -------- | ------- |
| S1 | `src/shared/tasks.ts:29` | drop `via` from the filler list | ✅ killed |
| S2 | `src/shared/tasks.ts:37` | drop `with` (last entry) | ✅ killed |
| S3 | `src/shared/tasks.ts:58` | no repeat collapse | ✅ killed |
| S4 | `src/shared/tasks.ts:56` | collapse repeats before dropping fillers | ✅ killed |
| S5 | `src/shared/tasks.ts:63` | cap `>` → `>=` | ✅ killed |
| S6 | `src/shared/tasks.ts:42` | cap 40 → 41 | ✅ killed |
| S7 | `src/shared/tasks.ts:61` | first word not cut at 40 | ✅ killed |
| S8 | `src/shared/tasks.ts:57` | no fallback when only fillers remain | ✅ killed |
| S9 | `src/shared/tasks.ts:63` | `break` → `continue` (later short words kept) | ✅ killed |
| S10 | `src/shared/tasks.ts:53` | fillers matched before lowercasing | ✅ killed |
| S11 | `src/shared/tasks.ts:57` | repeat collapse skipped in the filler-only fallback | ❌ survived → follow-up 2 |
| G1 | `src/main/git.ts:61` | prefer `fatal:` only | ✅ killed |
| G2 | `src/main/git.ts:61` | prefix not anchored (`hint: fatal:` picked) | ✅ killed |
| G3 | `src/main/git.ts:61` | first non-empty line only | ✅ killed |
| G4 | `src/main/git.ts:61` | `fatal:` preferred over an earlier `error:` | ✅ killed |
| G5 | `src/main/git.ts:60` | lines not trimmed | ✅ killed |
| G6 | `src/main/worktree-manager.ts:17` | `GitError` detail from the Error message | ✅ killed |
| G7 | `src/main/git-sync.ts:70` | `runGitOp` error from the Error message | ✅ killed |
| P1 / P2 | `src/main/path-limits.ts:46` | ref `>` → `>=` / limit + 1 | ✅ killed / ✅ killed |
| P3 / P4 | `src/main/path-limits.ts:52` | reflog `>` → `>=` / limit + 1 | ✅ killed / ✅ killed |
| P5 / P6 | `src/main/path-limits.ts:60` | folder `>` → `>=` / limit + 1 | ✅ killed / ✅ killed |
| P7 / P8 | `src/main/path-limits.ts:66` | git folder `>` → `>=` / limit + 1 | ✅ killed / ✅ killed |
| P9 | `src/main/path-limits.ts:44` | ref rules ignore `writesRef` | ✅ killed |
| P10 | `src/main/path-limits.ts:44` | ref rules ignore `longPaths` | ✅ killed |
| P11 | `src/main/path-limits.ts:50` | reflog rule on a branch with no `/` | ✅ killed |
| P12 | `src/main/path-limits.ts:63` | git folder rule ignores `longPaths` | ✅ killed |
| P13 | `src/main/path-limits.ts:60` | folder rule lifted by `longPaths` | ✅ killed |
| P14 | `src/main/path-limits.ts:44` | folder checked before the ref rules | ✅ killed |
| P15 | `src/main/path-limits.ts:33` | trailing separator kept | ✅ killed |
| P16 | `src/main/path-limits.ts:45` | `.lock` left out of the ref path | ✅ killed |
| C1 | `src/main/path-limits.ts:94` | gate `!== 'win32'` → `=== 'linux'` (darwin checked) | ❌ survived → follow-up 3 |
| C2 | `src/main/path-limits.ts:94` | platform gate removed | ✅ killed |
| C3 | `src/main/path-limits.ts:108` | `core.longpaths` read without `--type=bool` | ✅ killed |
| C4 | `src/main/path-limits.ts:108` | `core.longpaths` read from the global config | ✅ killed |
| C5 | `src/main/path-limits.ts:121` | `writesRef` always true | ✅ killed |
| C6 | `src/main/path-limits.ts:121` | Recreate not treated as writing a ref | ✅ killed |
| C7 | `src/main/path-limits.ts:121` | any non-Reuse choice treated as Recreate | ✅ killed |
| C8 | `src/main/path-limits.ts:103` | unreadable repository gives a message | ✅ killed |
| C9 | `src/main/path-limits.ts:125` | worktree template ignored in the folder path | ✅ killed |
| W1 | `src/main/worktree-manager.ts:97` | `createWorktree` runs no path check | ✅ killed |
| W2 | `src/main/worktree-manager.ts:93` | check moved after the base refresh | ✅ killed |
| W3 | `src/main/worktree-manager.ts:93` | check moved after the existing-branch fork (after Recreate's `branch -D`) | ❌ survived → follow-up 1 |
| W4 | `src/main/worktree-manager.ts:94` | `onExisting` not passed to the check | ❌ survived → follow-up 1 |
| K1 | `src/renderer/src/lib/path-check.ts:23` | `problemFor` ignores the key | ✅ killed |
| K2 | `src/renderer/src/lib/path-check.ts:12` | key ignores `worktreeTemplate` | ✅ killed |
| K3 | `src/renderer/src/lib/path-check.ts:11` | key tells absent and empty base apart | ✅ killed |
| K4 | `src/renderer/src/lib/path-check.ts:9` | key ignores `repoPath` | ✅ killed |

W3 and W4 are counted once each above, as survivors of the committed suite. To confirm that the gap is in the
tests and not in the production code, I ran a scratch probe test, never committed. It creates an M2-shaped
branch with a reflog folder of 248 and a ref path of 251, which git sees with `core.longpaths` off, and
Recreates it through `createWorktree`. It expects `{ ok: false, error: reflogMessage(248) }` and an unchanged
tip.

- At HEAD the probe passes.
- With W3 or W4 applied it fails: the create runs `branch -D` and the refusal never comes.

The same probe confirmed that a 270 ref path stays invisible to git with `core.longpaths` off even when packed.
That is why the committed BSLG-38 test never reaches the Recreate fork.

### Smoke mutants (2 injected, both survived; budget 5)

A baseline run at HEAD gave 7/7. Each run used a fresh seed under a short throwaway base folder and a fresh
dev-app launch: throwaway `--user-data-dir`, CDP port 9333, the three anti-throttling flags. `--clean` ran
after each. Only the processes started for the run were killed, found by their user-data-dir.

| ID | File:line | Mutation | Outcome |
| -- | --------- | -------- | ------- |
| SM-A | `src/renderer/src/lib/use-path-check.ts:68` | the hook returns the last answer whatever its key (BSLG-42 wiring) | ❌ survived 7/7 → follow-up 4 |
| SM-D | `src/renderer/src/lib/use-path-check.ts:66` | `repoPath` dropped from the effect's dependencies: a repository change asks nothing (BSLG-23) | ❌ survived 7/7 → follow-up 4 |

On SM-D: smoke 3 goes from a refused repository to an accepted one. A mutant that stops asking also shows no
line, so the check cannot fail. In the app, switching from an accepted repository to a refusing one shows no
message and leaves Create enabled. `worktrees:create` still refuses with the same message (BSLG-25, smoke 4),
so no worktree is half-made.

I did not inject three hook mutants, because no smoke check exercises them: a template change, a different
debounce literal in the hook, and Start Work not wired. They would survive trivially. They are covered by
follow-ups 4 and 5.

**Sensor depth**: expanded. **Totals**: 53 injected, 47 killed, 6 survived (W3, W4, S11, C1 in the unit suite;
SM-A, SM-D in smoke). All six are in test code or smoke, none in production.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `path-limits.ts` holds a pure rule plus one reader. The hook and the key helper are small |
| Surgical changes | ✅ The old `errorLine` is removed rather than duplicated. `GitError` reuses `gitFailureLine` |
| No scope creep | ✅ No timeout work and no renaming. `core.longpaths` is never set |
| Matches patterns | ✅ Injected `deps` as in other main modules. The pure helper sits under `renderer/src/lib` (L-012/L-018) |
| Spec-anchored outcome check | ✅ Messages, lengths and slugs are asserted as exact literals |
| Per-layer coverage | ⚠️ Pure layers are 1:1. The hook and dialog wiring rely on smoke 1–7, which miss SM-A and SM-D |
| Every test maps to a requirement | ✅ Test names carry BSLG IDs |
| Documented guidelines | `.specs/STATE.md` decisions, AD-056 recorded at T16 |

---

## Gate Check

- **Commands** (real tree, once): `npm run typecheck && npm run lint && npm test` → exit 0; `npx electron-vite build` → exit 0
- **Tests**: 2620 passed, 0 failed, 0 skipped (121 files). This matches the baseline handed to the Verifier, and no flake was seen
- **Lint**: 0 errors, 18 warnings (the pre-existing prettier baseline)
- **Smoke** (`SMOKE_ONLY=longpath`, scratch worktree): 7/7 at HEAD. Checks 8–9 were not run (`SMOKE_LONG_TASK_URL` deliberately unset)

## Privacy And BSLG-26 Scans

- `git diff 6d96ae4..HEAD`, case-insensitive search for the owner's organisation, product and surname: no hits
- Windows user-profile paths, the owner's user name, local drive paths: no hits
- Work item URLs: only the placeholders `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>` and `.../_workitems/edit/<id>` in the smoke's messages
- `core.longpaths` in `src/` outside tests: read only (`src/main/path-limits.ts:108`), and no `-c` argument anywhere. The smoke script sets it only in its own seeded throwaway repositories

---

## Follow-ups (ranked)

1. **Test Recreate's check placement on a branch git can see** (BSLG-25 "no branch delete", BSLG-38; W3, W4). Add a
   `createWorktree` test that Recreates an M2-shaped branch (reflog folder 248, ref path 251) and expects
   `{ ok: false, error: reflogMessage(248) }` with the tip unchanged. The scratch probe described above is that
   test and kills both mutants. Also restate BSLG-38 so it can fail on placement: today it names the ref-path rule,
   and a branch past that rule is invisible to git with `core.longpaths` off, so it can never reach the Recreate
   fork.
2. **Repeat collapse inside the filler-only fallback** (BSLG-06; S11): for example, assert that `De de para` gives `de-para`.
3. **The platform gate on a second non-Windows platform** (BSLG-22; C1): add `darwin` next to `linux`.
4. **Hook wiring in smoke** (BSLG-23, BSLG-42; SM-A, SM-D):
   - Add a check that goes from an accepted repository (web) to a refusing one (api) with the 287 name, expecting
     the line. Starting from a different state is what kills SM-D (L-031).
   - Add a check that changes the worktree override and expects a fresh answer.
   - Proving the stale-answer guard (SM-A) needs either a hook-level test with a deferred `api.invoke` or a race
     in smoke.
5. **Start Work's check and the long-title create** (BSLG-08/10/20/24, T18 checks 8–9): an owner run with
   `SMOKE_LONG_TASK_URL` set. The owner already recorded this section as optional.
6. **BSLG-41's "git missing" arm**: a `checkCreatePaths` test whose `git` stub rejects with `ENOENT` and
   expects `null`. It is low risk, because the `catch` is shared with the "not a repository" case.

## Requirement Traceability Update

Every BSLG-01..44 is implemented and has evidence. The statuses in spec.md stay "Done". The follow-ups above are
recorded in spec.md under `## Follow-ups`.

## Follow-ups 1–3 closed (2026-10-03, before the PR)

The owner asked for follow-ups 1–3 before the PR; the orchestrator added three tests and saw each kill its
surviving mutant, run in the real tree through a script that restored the file in `finally`:

| Follow-up | Test | Mutant | Result |
| --------- | ---- | ------ | ------ |
| 1 (BSLG-25, BSLG-38) | `src/main/worktree-manager.test.ts`, "refuses Recreate of an M2-shaped branch git can see before deleting it": `toEqual({ ok: false, error: reflogMessage(248) })`, tip unchanged, one worktree, no folder | W4 (`onExisting` not passed) | killed |
| 2 (BSLG-06) | `src/shared/tasks.test.ts`, BSLG-06 case: `slug('De de para')` → `'de-para'` | S11 (no repeat collapse in the fallback) | killed |
| 3 (BSLG-22) | `src/main/path-limits.test.ts`, "runs no git and reports nothing on macOS either": `null`, `calls` `toEqual([])` | C1 (gate keyed on `linux`) | killed |

W3 (check moved below the existing-branch fork) fails the same Recreate test: the create would delete the branch
before the check, so the tip assertion fails, as the Verifier's probe showed. BSLG-38 is restated in spec.md
at the reflog folder shape. Follow-ups 4–6 stay open.
