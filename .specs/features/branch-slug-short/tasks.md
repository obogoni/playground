# Branch Slug Short Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/branch-slug-short/design.md`
**Status**: Approved (planned 2026-10-01, approved by the owner 2026-10-01)

**Branch**: `feature/branch-slug-short`, cut from `origin/main` `60ff148`. The PR body carries `Closes #145`.

**Setup (part of T1, no separate commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` and `node node_modules/electron/install.js`, then record the **test baseline** in T1: `npx vitest run` count, `npm run typecheck`, `npm run lint` errors and warnings, and the slowest test in `src/main/worktree-manager.test.ts` (L-005).

**Owner-confirmed rows** (spec Assumptions, `owner confirmed 2026-10-01`): the 259 limit and its wording, the reflog folder rule, the P2 folder check, the fallback cap, the repeat order, the filler match after transliteration, the existing-branch skip, Recreate's order, the boolean read, fail-open, the 250 ms debounce, Create while pending, where the line shows, and `GitError`, all as the plan proposed them. The smoke's `SMOKE_LONG_TASK_URL` is optional: without it, the slug section (checks 8–9) is skipped with a printed notice and counts as neither pass nor fail, in a full run too; the slug rule's proof is T2's unit tests.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, `.github/workflows/ci.yml` (`windows-latest`), confirmed lessons L-001, L-005, L-009, candidate lessons L-019, L-021, L-023, L-024, L-025, L-026, L-028, L-031, L-035, L-050, L-053, L-054, L-087, L-091.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Shared pure module (`tasks.ts`) | unit | 1:1 to BSLG-01..11 and 31..33; both sides of every boundary (L-028); one case per filler word (L-054); round trip over every template position (L-091) | `src/shared/tasks.test.ts` | `npx vitest run src/shared/tasks.test.ts` |
| Main git helper (`git.ts`) | unit | Every prefix with a real git failure (L-024); BSLG-12, 13, 43, 44 | `src/main/git.test.ts` | `npx vitest run src/main/git.test.ts` |
| Main pure rules (`pathLimitProblem`) | unit | Every rule at its exact boundary (L-028); each arm of every condition alone (L-087); constants pinned with literals (L-009, L-019) | `src/main/path-limits.test.ts` | `npx vitest run src/main/path-limits.test.ts` |
| Main git readers and orchestrators (`checkCreatePaths`, `createWorktree`, `git-sync`) | unit (real git in temp dirs) | Every BSLG the module owns, on real repositories with `core.longpaths` pinned in the repository's own config (L-026) | `src/main/<module>.test.ts` | `npx vitest run src/main/<module>.test.ts` |
| Renderer pure lib (`path-check.ts`) | unit | BSLG-42, the delay literal | `src/renderer/src/lib/path-check.test.ts` | `npx vitest run src/renderer/src/lib/path-check.test.ts` |
| IPC contract and `index.ts` wiring | none (thin shell) | Typecheck; exercised by the smoke | — | `npm run typecheck` |
| Renderer hook and dialogs | none (CDP smoke) | BSLG-20, 23, 24 in the running app | — | `node scripts/smoke-start-work.mjs` |
| Docs (`STATE.md`, sibling specs, Measurements) | none | — | — | review |
| End to end | manual CDP smoke | Every new check first seen failing on a deliberately broken build | `scripts/smoke-start-work.mjs` | seeded dev app, three steps (T17) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run <the task's test file>` then `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Renderer component tasks | `npm run typecheck && npm run lint && npx electron-vite build` |
| Manual | T1 and the smoke tasks T17–T18 | T1: the probe in T1's What; smoke: `node scripts/smoke-start-work.mjs --seed`; `npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; `SMOKE_ONLY=longpath node scripts/smoke-start-work.mjs` |

**Lint is judged by exit code AND by warning count** — diff it against the setup baseline at every gate.

**Smoke falsification rules** (every smoke task): each new check is first seen failing on a deliberately broken build, made by a script that keeps an `.orig` copy, applies the mutant, asserts the mutant text is present in the file, and restores the `.orig` in `finally`; `git status --porcelain` is checked clean afterwards. `npm run dev` does not restart the main process on `src/main` edits: a mutant under `src/main` needs the dev app relaunched. The dev app always runs on a throwaway `--user-data-dir` with the three anti-throttling flags above. No session is spawned; if one is ever needed it is an ad-hoc raw command (`pwsh -NoLogo -NoProfile`), never the registry Claude agent.

---

## Execution Plan

### Phase 1: Measure

```
T1
```

### Phase 2: Slug rule

```
T1 → T2
```

### Phase 3: Git's error line

```
T2 → T3 → T4 → T5
```

### Phase 4: Path check in main

```
T5 → T6 → T7 → T8 → T9
```

### Phase 5: IPC

```
T9 → T10 → T11
```

### Phase 6: Dialogs

```
T11 → T12 → T13 → T14 → T15
```

### Phase 7: Record and prove

```
T15 → T16 → T17 → T18
```

---

## Task Breakdown

### T1: Confirm the long-path limits on this machine

**What**: Setup and baseline (see top). Then, in a throwaway folder outside the repository, re-run the planning probe's six shapes (design.md, Measurements, M1–M6) plus M4 with `core.longpaths=true`, growing the branch one character at a time around each boundary, and record per row the last created and first refused length and git's stderr lines in a new `Execute machine` column. Measure the `user` / `user/x` collision T5 relies on and record its stderr, and record what `worktree add <folder> <branch>` does with `core.longpaths=false` for an existing long branch packed by `pack-refs --all` (T9's Reuse test asserts that outcome). **Stop rule:** if any boundary differs from M1–M6 (ref path 259/260, reflog folder 247/248, worktree folder 215/216, worktree git folder 247/248), or M4 is *not* lifted by `core.longpaths=true`, or the collision does not print `Preparing worktree …` before a `fatal:` line, stop: report the numbers to the owner and start no other task until the plan is updated.
**Where**: `.specs/features/branch-slug-short/design.md` (Measurements)
**Depends on**: None
**Reuses**: the shapes in design.md
**Requirement**: BSLG-14, BSLG-17, BSLG-18, BSLG-27, BSLG-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npm ci --ignore-scripts` and `node node_modules/electron/install.js` done; baseline recorded here: test count, typecheck, lint errors / warnings, slowest worktree-manager test
- [x] Every Measurements row has its `Execute machine` value, and M4 with `core.longpaths=true` has its own row
- [x] Every boundary matches, or the stop rule fired and the owner was told (no later task started)
- [x] The probe lives outside the repository; `git status --porcelain` shows only design.md and tasks.md

**Baseline** (2026-10-03, at `8d6666b`): `npx vitest run` 119 files, 2508 tests passed, 0 failed;
`npm run typecheck` exit 0; `npm run lint` exit 0 with 0 errors and 18 warnings (all prettier, in
`scripts/` and `src/shared/tasks.test.ts`); slowest test in `src/main/worktree-manager.test.ts`
run alone: 9.3 s (`createWorktree — base refresh (WBR) fast-forwards a checked-out base and cuts the
new branch from the remote tip`), against the 30 s `testTimeout`.

**Result**: every boundary matches M1–M6 (design.md, `Execute machine` column); M4 is lifted by
`core.longpaths=true` (row M4L); the `user` / `user/x` collision prints `Preparing worktree …`
before its `fatal:` line. The stop rule did not fire. Probe base folder `D:\bss-probe`, removed.
**Finding for T8 and T9**: with `core.longpaths=false`, an existing branch whose ref path is 260 or
more does not resolve at all, packed or loose: `rev-parse --verify` exits 1 and
`worktree add <folder> <branch>` fails with `fatal: invalid reference: <branch>` (design.md,
Measurements). T8's existing-branch cases and T9's Reuse test must be read against that.

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): confirm the long-path limits on the execute machine`

---

### T2: Concise slugs

**What**: `slugOf` drops the filler words, collapses a word equal to the one before it, and caps at 40 at a word boundary, with the fallback, as in design.md. Update exactly three existing expected values the spec changes: `configuracao-de-ambiente` → `configuracao-ambiente` (`tasks.test.ts:27-28` and `:86`) and `42-crash-on-save` → `42-crash-save` (`:48`); name them in the commit body.
**Where**: `src/shared/tasks.ts`
**Depends on**: T1
**Reuses**: today's transliteration in `slugOf`; the APIN-04 round-trip test
**Requirement**: BSLG-01, BSLG-02, BSLG-03, BSLG-04, BSLG-05, BSLG-06, BSLG-07, BSLG-08, BSLG-09, BSLG-10, BSLG-11, BSLG-31, BSLG-32, BSLG-33

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, fillers: an `it.each` over all 29 filler words (the issue's 28 plus `via`), `Fix {word} login` → `feature/7-fix-login` each; `Fix À login` and `Fix DE login` → `fix-login`; near misses kept: `Fix an at by nas pela login` → `fix-an-at-by-nas-pela-login`
- [x] Tests, repeats: `Fix fix FIX login` → `fix-login`; `Validação de validação` → `validacao`; `login fix login` → `login-fix-login` (BSLG-33)
- [x] Tests, cap: `Revisar fluxo de pagamento recorrente via banco` → `revisar-fluxo-pagamento-recorrente-banco` (40) and `… via bancos` → `revisar-fluxo-pagamento-recorrente` (34); a 40-letter word kept whole and a 41-letter word cut to its first 40 (BSLG-32); `Supercalifragilisticexpialidociousextraordinarily long` → `supercalifragilisticexpialidociousextrao`
- [x] Tests, fallback and numbers: `De a para` → `de-a-para`; `Para por para com para de dos das para em no na e ou um uma` → `para-por-para-com-para-de-dos-das-para` (38); `Migrar para v2 em 3 etapas` → `migrar-v2-3-etapas`; `!!!` still gives `feature/4821` (BSLG-31)
- [x] Tests, AC 8 and the nested template: task and parent both titled with the AC 8 title → `user/dev/10001-ajustar-validacao-campos-cadastro/10002-ajustar-validacao-campos-cadastro`
- [x] Tests, AC 9: template `de/{id}-{slug}` keeps `de/`; alias `of` renders `user/of/…`; `{usId}` and `{id}` digits untouched
- [x] Tests, AC 10 and 11: the APIN-04 title list gains the AC 8 title, `De a para` and the 49-letter word, and every combination still returns 4821; `taskIdFromBranch` and `taskIdFromTemplate('{type}/{id}-{slug}', …)` return 4821 for `feature/4821-configuracao-de-ambiente`
- [x] No assertion other than the three named values is edited
- [x] Gate check passes: `npx vitest run src/shared/tasks.test.ts` then `npm test`
- [x] Test count: baseline + the new tests

**Done** (T2): 43 new tests in `src/shared/tasks.test.ts`; suite 2508 → 2551 passed. AC 3 and AC 4's titles hold `via`,
which the issue's 28 words did not drop, so they gave `revisar-fluxo-pagamento-recorrente-via` (38) both times. The
owner settled it on 2026-10-03 by adding `via` to the filler list (follow-up commit after T2); the tests use the AC
titles as written.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): shorten branch slugs to their meaningful words`

---

### T3: `gitFailureLine` prefers git's error line

**What**: `gitFailureLine` returns the first stderr line whose trimmed text starts with `fatal:` or `error:`, else today's result.
**Where**: `src/main/git.ts`
**Depends on**: T2
**Reuses**: `git.test.ts`'s `rejectionOf` helper
**Requirement**: BSLG-12, BSLG-13, BSLG-15, BSLG-43, BSLG-44

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, synthetic: `Preparing worktree (new branch 'x')` then `fatal: cannot lock ref …` → the `fatal:` line; `hint: a` then `error: b` → `error: b`; `error: a` then `fatal: b` → `error: a` (BSLG-43); `hint: fatal: x` alone → `hint: fatal: x`, and followed by `fatal: y` → `fatal: y` (BSLG-44); `   fatal: z  ` → `fatal: z`
- [x] Tests, real (L-024): a real `fatal:` failure (`rev-parse --verify no-such-ref` in a temp repo) and a real `error:` failure (`checkout no-such-path` in a temp repo) each return their prefixed line
- [x] The three existing `gitFailureLine` tests pass unchanged
- [x] Gate check passes: `npx vitest run src/main/git.test.ts` then `npm test`
- [x] Test count: T2 count + the new tests

**Done** (T3): 7 new tests in `src/main/git.test.ts`; suite 2551 → 2558 passed.

**Tests**: unit
**Gate**: quick

**Commit**: `fix(git): show git's fatal or error line instead of its progress note`

---

### T4: Sync operations use the shared error line

**What**: Delete `errorLine` and its SPEC_DEVIATION comment from `git-sync.ts`; `runGitOp`'s catch uses `gitFailureLine`.
**Where**: `src/main/git-sync.ts`
**Depends on**: T3
**Reuses**: `gitFailureLine`
**Requirement**: BSLG-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The existing `git-sync.test.ts` tests (STBR-18 pull and push error lines) pass unchanged
- [x] `grep -rn "errorLine\|(fatal|error)" src/main --include=*.ts` finds only `git.ts` and its test
- [x] Gate check passes: `npx vitest run src/main/git-sync.test.ts` then `npm test`
- [x] Test count: T3 count, unchanged

**Done** (T4): `git-sync.test.ts` 30 passed unchanged; suite 2558 passed, unchanged.

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(git): drop the sync module's own error-line extractor`

---

### T5: Worktree failures carry git's line

**What**: `GitError`'s detail becomes `gitFailureLine(cause)`; a test pins the `fatal:` line of a failing `worktree add`.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T4
**Reuses**: the `createWorktree` and `listWorktrees` temp-repo setups
**Requirement**: BSLG-14, BSLG-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Test: `listWorktrees` on a plain folder rejects with a `GitError` whose message starts with `git failed in {folder}: fatal: not a git repository`
- [x] Test: in a repository with a branch `user`, `createWorktree(repo, 'user/x', 'main')` returns `ok: false` with an error that starts with `fatal: cannot lock ref 'refs/heads/user/x'` and does not contain `Preparing worktree`
- [x] Both tests seen failing with T3's change reverted in a scratch copy, then passing
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test`
- [x] Test count: T4 count + 2

**Done** (T5): 2 new tests; suite 2558 → 2560 passed; typecheck 0; lint 0 errors, 18 warnings (baseline). Seen failing in a scratch worktree outside the repository: with T3's `git.ts` reverted and T5 not applied, both fail (`Command failed: git worktre…` and `Preparing worktree (new branch 'user/x')`); with T3 reverted and T5 applied, the create test still fails and the list test passes, since the old rule's first stderr line is already the `fatal:` line there.

**Tests**: unit
**Gate**: quick

**Commit**: `fix(worktrees): report git's own line when listing or creating fails`

---

### T6: Ref path rules, pure

**What**: New `path-limits.ts` with the three constants, `PathLimitInput` and `pathLimitProblem` rules 1 and 2 (ref path, reflog folder), as in design.md.
**Where**: `src/main/path-limits.ts`
**Depends on**: T5
**Reuses**: none
**Requirement**: BSLG-17, BSLG-18, BSLG-19, BSLG-21, BSLG-34, BSLG-35, BSLG-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, constants: `WINDOWS_MAX_FILE_PATH` is 259, `WINDOWS_MAX_FOLDER_PATH` 247, `GIT_MAX_WORKTREE_FOLDER` 215, as literals (L-009, L-019)
- [x] Tests, ref path: commonDir `C:\r\.git` and a branch giving a ref path of exactly 259 → null; 260 → `The branch's ref path is 260 characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.`; 287 → the same text with 287 (BSLG-35)
- [x] Tests, reflog folder: a two-letter last segment with a reflog folder of 247 → null and 248 → `The branch's reflog folder path is 248 characters, over Windows' limit of 247 for a folder. Shorten the name, or enable core.longpaths in the repository.`, the ref path at 250 and 251 in those cases (BSLG-36); a 260-character branch with no `/` gives the ref message (BSLG-34)
- [x] Tests, each arm alone (L-087): `longPaths: true` → null for both rules; `writesRef: false` → null for both; a case past both limits returns the ref message
- [x] Tests, normalisation: commonDir `C:/r/.git` and `C:\r\.git\` give the same lengths as `C:\r\.git`
- [x] Gate check passes: `npx vitest run src/main/path-limits.test.ts` then `npm test`
- [x] Test count: T5 count + the new tests

**Done** (T6): 14 new tests in `src/main/path-limits.test.ts`; suite 2561 → 2575 passed; typecheck 0; lint 0 errors, 18 warnings (baseline). BSLG-34 also holds a no-`/` branch with a ref path of 259, which passes: read as a folder, the whole name would be 259, past 247.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): tell when a branch's ref path is too long for Windows`

---

### T7: Worktree folder rules, pure (P2)

**What**: `pathLimitProblem` rules 3 and 4 (worktree folder, worktree's git folder) and the AC 29 order.
**Where**: `src/main/path-limits.ts`
**Depends on**: T6
**Reuses**: T6's normalisation
**Requirement**: BSLG-27, BSLG-28, BSLG-29

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, folder: worktreePath of 215 → null and 216 → `The worktree folder path is 216 characters, over the 215 git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`; still refused with `longPaths: true` and with `writesRef: false`
- [x] Tests, git folder: `{commonDir}\worktrees\{name}\refs` of 247 → null and 248 → `The worktree's git folder path is 248 characters, over Windows' limit of 247 for a folder. Shorten the name, use a shorter worktree template, or enable core.longpaths in the repository.`; null with `longPaths: true`
- [x] Tests, order (BSLG-29): ref and folder both passed → ref message; reflog and folder → reflog message; folder and git folder → folder message
- [x] T6's tests pass unchanged
- [x] Gate check passes: `npx vitest run src/main/path-limits.test.ts` then `npm test`
- [x] Test count: T6 count + the new tests

**Done** (T7): 11 new tests; suite 2575 → 2586 passed; T6's 14 unchanged; typecheck 0; lint 0 errors, 18 warnings (baseline). Six of them seen failing before rules 3 and 4 existed. The git folder rule is also tested with `writesRef: false` (AC 28 has no ref condition), and the git folder cases use a 40-character repository folder so the worktree folder stays at 215 or fewer, as in M4.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): tell when a worktree folder is too long for git`

---

### T8: Read the repository for the check

**What**: `checkCreatePaths(req, deps)` as in design.md: platform gate, common dir, boolean `core.longpaths`, local branch existence, `writesRef`, then `pathLimitProblem`. `PathCheckRequest` goes in `src/shared/worktrees.ts`.
**Where**: `src/main/path-limits.ts` (type in `src/shared/worktrees.ts`)
**Depends on**: T7
**Reuses**: `git`, `GitRunner`, `worktreePathFor`
**Requirement**: BSLG-17, BSLG-21, BSLG-22, BSLG-37, BSLG-39, BSLG-40, BSLG-41

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (real temp repos, `realpathSync.native`): `platform: 'linux'` returns null and a recording runner sees no call (BSLG-22)
- [x] Tests, `platform: 'win32'`, repository-local `core.longpaths=false`: a new branch with a ref path of 270 returns the ref message with 270, the expected length computed in the test from `realpathSync.native(repo)` and the branch, not from the code under test
- [x] Tests: local `core.longpaths` `true` → null and `yes` → null (BSLG-21); `maybe` → `checkCreatePaths` returns null, and `createWorktree` (T9) returns an error starting with `fatal: bad boolean config value` (BSLG-39); `GIT_CONFIG_GLOBAL` pointing at a temp file with `core.longpaths=true` while the repository holds `false` → the message (BSLG-40), the env restored in `afterEach`
- [x] Tests, existing branch git can still read (owner, 2026-10-03, after T1's finding): a branch of M2's shape, ref path 259 or fewer and reflog folder 248 or more, created by the test with `git -c core.longpaths=true branch` (test-only): no base → null; base + `reuse` → null; base + no `onExisting` → null; base + `recreate` → the reflog message, AC 18 (BSLG-37)
- [x] Test, existing branch git cannot read: a branch with a ref path of 270 made the same way is absent for git under `core.longpaths=false` (T1), so with no base the check returns the ref message, AC 17, with 270
- [x] Tests: a plain folder → null (BSLG-41)
- [x] Gate check passes: `npx vitest run src/main/path-limits.test.ts` then `npm test` (slowest test compared with T1's baseline, L-005)
- [x] Test count: T7 count + the new tests

**Done** (T8): 13 new real-git tests in `src/main/path-limits.test.ts` (one repository for the block, about 5 s); suite 2586 → 2599 passed; typecheck 0; lint 0 errors, 18 warnings (baseline). BSLG-39 amended on the owner's decision of 2026-10-03: with `core.longpaths=maybe`, git refuses every command the check runs (design.md, Measurements), so the check returns null; T9 tests the create's `fatal:` line. The requests use a short literal worktree template (`wt`), so the default `{repo}-{branch}` folder rule cannot speak for these long names. An existing branch with a base and no `onExisting` writes no ref (rewritten Done-when; design.md brought in line).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): read the git dir and core.longpaths for the path check`

---

### T9: Refuse before any git write

**What**: `createWorktree` gains the optional `deps` argument and runs `checkCreatePaths` after its two existing guards and before the existing-branch fork, the base refresh and `worktree add`.
**Where**: `src/main/worktree-manager.ts`
**Depends on**: T8
**Reuses**: `removeWorktree`'s deps pattern; the create test setups
**Requirement**: BSLG-25, BSLG-26, BSLG-30, BSLG-35, BSLG-37, BSLG-38, BSLG-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (`platform: 'win32'`, local `core.longpaths=false`): a ref path of 260 returns the ref message; no folder at `worktreePathFor`, `git branch --list` empty, `git worktree list` holds one entry (BSLG-25)
- [x] Test: the same call with `updateBase: true` on a base whose upstream remote points at a missing path returns the ref message, not a fetch error (no refresh ran)
- [x] Test: a ref path of 259 is created and its ref exists (BSLG-35, git accepts the boundary)
- [x] Test: with local `core.longpaths=true`, a ref path of 270 is created (BSLG-21 end to end)
- [x] Test: Recreate of an existing branch with a ref path of 270 (made and packed by the test with `git -c core.longpaths=true`, test-only) returns the AC 17 message and the branch still resolves under `git -c core.longpaths=true rev-parse --verify` (BSLG-38)
- [x] Test: Reuse, with `core.longpaths=false`, of an existing branch of M2's shape (ref path 259 or fewer, reflog folder 248 or more, made test-only as in T8) is not refused with a path message; measure first what `worktree add` then does and assert that outcome, recorded in design.md Measurements (BSLG-37)
- [x] Test (P2): default template, a folder path of 216 returns the folder message and creates nothing (BSLG-30)
- [x] Test: with the repository's `core.longpaths` set to `maybe`, `createWorktree` returns an error starting with `fatal: bad boolean config value` and creates nothing (BSLG-39, owner amended 2026-10-03)
- [x] Test: after each call, `git config --local --get core.longpaths` reads what the test set (BSLG-26); `grep -rn "longpaths" src/main --include=*.ts` outside tests finds only the read in `path-limits.ts`
- [x] The existing `createWorktree` and EXB tests pass unchanged
- [x] Gate check passes: `npx vitest run src/main/worktree-manager.test.ts` then `npm test`
- [x] Test count: T8 count + the new tests

**Done** (T9): 8 new real-git tests in `src/main/worktree-manager.test.ts` (0.8–1.5 s each, against the 9.3 s baseline); suite 2599 → 2607 passed; typecheck 0; lint 0 errors, 18 warnings (baseline). The four refusals were seen failing before `createWorktree` called the check. Reuse of the M2-shaped branch was measured first: `worktree add` exits 0 and checks the branch out (design.md, Measurements), and the test asserts that. The refresh test first shows that a short name reaches the refresh and gets git's fetch error, so the refusal's lack of one means no refresh ran. `grep -rln longpaths src/main --include=*.ts` outside tests lists only `path-limits.ts`, whose one git call with it is the `config --type=bool --get` read.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): refuse a too-long name before git creates anything`

---

### T10: Typed channel for the dialog's ask

**What**: `'worktrees:check-paths'` in the contract, beside `worktrees:create`, with a one-line comment.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T9
**Reuses**: `PathCheckRequest`
**Requirement**: BSLG-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `req` is `Omit<PathCheckRequest, 'onExisting'>`, `res` is `{ problem: string | null }`
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done** (T10): typecheck 0; lint 0 errors, 18 warnings (baseline); suite 2607 passed, unchanged.

**Tests**: none
**Gate**: full

**Commit**: `feat(ipc): add a channel to check a worktree name's paths`

---

### T11: Wire the channel

**What**: `handle('worktrees:check-paths', …)` in `index.ts`, beside `worktrees:create`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: `checkCreatePaths`
**Requirement**: BSLG-23, BSLG-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The handler returns `{ problem }` from `checkCreatePaths(req)` with the real deps
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done** (T11): the handler calls `checkCreatePaths(req)` with no deps, so the real platform and git; typecheck 0; lint 0 errors, 18 warnings (baseline); suite 2607 passed, unchanged.

**Tests**: none
**Gate**: full

**Commit**: `feat(worktrees): answer the dialog's path check`

---

### T12: Match an answer to the dialog's values, pure

**What**: `path-check.ts` with `PATH_CHECK_DELAY_MS`, `pathCheckKey` and `problemFor`, as in design.md.
**Where**: `src/renderer/src/lib/path-check.ts`
**Depends on**: T11
**Reuses**: `PathCheckRequest`
**Requirement**: BSLG-23, BSLG-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `PATH_CHECK_DELAY_MS` is 250 (literal); keys differ when any of the four values differs, alone (L-087); `baseBranch` absent and `''` give the same key, and the same for `worktreeTemplate`
- [x] Tests: `problemFor` returns the problem for the current key, null for another key (BSLG-42), null for a null answer, and null for a current answer with no problem
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/path-check.test.ts` then `npm test`
- [x] Test count: T9 count + the new tests

**Done** (T12): 13 new tests in `src/renderer/src/lib/path-check.test.ts`; suite 2607 → 2620 passed. The key is the four values as a JSON array, so a `|` inside one value cannot make two value sets share a key (one test pins it).

**Tests**: unit
**Gate**: quick

**Commit**: `feat(worktrees): match a path check answer to the dialog's current name`

---

### T13: The debounced ask

**What**: `usePathCheck(req)` as in design.md: timer, invoke, stale guard, no `setState` in the effect body.
**Where**: `src/renderer/src/lib/use-path-check.ts`
**Depends on**: T12
**Reuses**: `path-check.ts`, `api.invoke`, the dialogs' `stale` pattern
**Requirement**: BSLG-23, BSLG-42

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A null request returns null and schedules nothing; an unmount or key change clears the pending timer
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` (warning count unchanged, L-035)

**Done** (T13): `usePathCheck` in `src/renderer/src/lib/use-path-check.ts`. The effect depends on the four values, sets a 250 ms timer and stores `{ key, problem }` only from the invoke's callback (no `setState` in the effect body); its cleanup clears the timer and marks the call stale. A null request returns before scheduling. A rejected invoke is logged and stores nothing. Typecheck 0; lint 0 errors, 18 warnings (baseline); suite 2620 passed, unchanged.

**Tests**: none
**Gate**: full

**Commit**: `feat(worktrees): ask main about a name's paths as it changes`

---

### T14: Start Work shows the check

**What**: `StartWorkDialog` calls `usePathCheck`, shows the `.dialog-path-limit` line under the path preview, and gates `canCreate` on it.
**Where**: `src/renderer/src/components/StartWorkDialog.tsx`
**Depends on**: T13
**Reuses**: `.dialog-error`, `Icon name="alert"`
**Requirement**: BSLG-20, BSLG-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The request carries `repoPath`, `branch`, `baseBranch.trim() || undefined` and `effectiveWorktreeTemplate`; null without a selected repository or with a blank branch
- [x] `grep -n "dialog-error\|dialog-btn-primary" scripts/smoke-start-work.mjs` selectors still match (L-053)
- [x] Gate check passes: `npm run typecheck && npm run lint && npx electron-vite build`

**Done** (T14): the path line renders right under the path preview, as `.dialog-error.dialog-path-limit` with the alert icon, and `canCreate` gains `&& pathProblem === null`. The smoke's `.dialog-btn-primary` (line 205) and `.dialog-error` (line 214) selectors still match. Typecheck 0; lint 0 errors, 18 warnings (baseline); `electron-vite build` exit 0.

**Tests**: none
**Gate**: build

**Commit**: `feat(tasks): warn in Start Work when the branch's paths are too long`

---

### T15: New worktree shows the check

**What**: The same in `NewWorktreeDialog`.
**Where**: `src/renderer/src/components/NewWorktreeDialog.tsx`
**Depends on**: T14
**Reuses**: T14's markup
**Requirement**: BSLG-20, BSLG-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Same request shape and gate as T14
- [x] `grep -rn "dialog-error\|dialog-btn-primary" scripts/smoke-create.mjs` selectors still match (L-053)
- [x] Gate check passes: `npm run typecheck && npm run lint && npx electron-vite build`

**Done** (T15): the same request, line and `canCreate` gate as T14 in `NewWorktreeDialog`. `smoke-create.mjs`'s `.dialog-error` (lines 58, 124) and `.dialog-btn-primary` (lines 59, 95, 120, 142) selectors still match. Typecheck 0; lint 0 errors, 18 warnings (baseline); `electron-vite build` exit 0.

**Tests**: none
**Gate**: build

**Commit**: `feat(worktrees): warn in New worktree when the branch's paths are too long`

---

### T16: Record the decision

**What**: Append the design's AD-TBD to `.specs/STATE.md` `## Decisions` with the next free number (check `origin/main` and open branches first; name the number in the commit body). Mark `start-work-from-task` STWK-01 AC 2 and the `status-bar` error-reporting row as amended by this feature and that AD (L-033).
**Where**: `.specs/STATE.md` (annotations in `.specs/features/start-work-from-task/spec.md` and `.specs/features/status-bar/spec.md`)
**Depends on**: T15
**Reuses**: AD-048's annotation style
**Requirement**: BSLG-01, BSLG-12, BSLG-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The AD number is checked free and named in the commit body
- [x] Both sibling rows point at this feature and the AD; nothing else in them changes

**Done** (T16): **AD-056**. Checked on 2026-10-03: this branch and `origin/main` (fetched) hold up to AD-053; local `feature/hours-hatching` and `feature/terminal-last-row` (and the fork's `terminal-last-row`) each claim AD-054; no branch or worktree mentions AD-056 or higher. The AD carries the owner's amendments: 29 filler words with `via`, BSLG-39 as amended, and T1's finding that git cannot see an existing branch with a ref path of 260 or more without `core.longpaths`. `start-work-from-task` gains a note under STWK-01 AC 2 and its traceability row; `status-bar`'s error-reporting row gains one sentence. design.md's AD-TBD heading and spec.md's AD-TBD pointer now name AD-056. **Renumbered AD-055 → AD-056 after the PR opened (2026-10-03):** #152 (PR #160), in a parallel session, recorded its own decision as AD-055 between this check and the push, and #146 (PR #158) holds AD-054.

**Tests**: none
**Gate**: quick

**Commit**: `docs(state): record concise slugs and the path check`

---

### T17: Smoke: path checks with no Azure DevOps

**What**: `smoke-start-work.mjs` gains `--seed`, `--clean`, `SMOKE_CONFIG` and `SMOKE_ONLY=longpath` as in design.md, and the header documents them. Checks, typed names sized from each repository's real common git dir:
- 1 New worktree on `api` (`core.longpaths=false`): a hand-typed name with a ref path of 287 shows the AC 17 text with 287, and `Create worktree` is disabled;
- 2 the same field changed to a ref path of 259 shows no path line and enables Create, then to 260 shows the text with 260 and disables it (L-050, L-052);
- 3 the 287 name on `web` (`core.longpaths=true`) shows no path line and Create is enabled;
- 4 `worktrees:create` invoked directly for the 287 name on `api` returns `ok: false` with the AC 17 text; no folder, branch or worktree appears;
- 5 creating `user/x` on `api` shows a dialog error starting with `fatal: cannot lock ref 'refs/heads/user/x'`, not `Preparing worktree`;
- 6 (P2) New worktree on `app` (default template, `core.longpaths=true`): a name making a 230-character folder shows the folder text with 230 and disables Create;
- 7 (P2) `worktrees:create` direct for that name returns the folder text and creates nothing.
**Where**: `scripts/smoke-start-work.mjs`
**Depends on**: T16
**Reuses**: `smoke-files-diff.mjs`'s seed modes; the existing `setInput` and `evaluate` helpers
**Requirement**: BSLG-14, BSLG-17, BSLG-19, BSLG-20, BSLG-21, BSLG-23, BSLG-24, BSLG-25, BSLG-27, BSLG-30

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its mutant, then passing: `canCreate` ignoring the problem (1, 2); `pathLimitProblem` returning null, relaunched (1); the ref limit compared with `>=` 259, relaunched (2); the `core.longpaths` read ignored, relaunched (3); `createWorktree` without the check, relaunched (4); `gitFailureLine` back to the first line, relaunched (5); rule 3 removed, relaunched (6, 7)
- [x] `SMOKE_ONLY=longpath` passes twice in a row on a fresh seed and launch; `--clean` leaves no seed folder
- [x] The legacy STWK checks still run when `SMOKE_TASK_URL` is set, reading `SMOKE_CONFIG`
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Done** (T17): `SMOKE_ONLY=longpath` 7/7 twice, each on a fresh seed under a short base folder and a fresh dev-app launch (throwaway `--user-data-dir`, CDP port 9333, the three anti-throttling flags); `--clean` removed the base folder both times. Every mutant ran on a fresh seed and a relaunched app, applied by a script that kept an `.orig`, asserted the anchor once and restored it in `finally`; `git status --porcelain` showed only the smoke script afterwards. Checks failed per mutant: `canCreate` 1, 2 and 6 (6 drives the same dialog gate); `pathLimitProblem` null 1, 2, 3, 4, 6, 7 (3 through its precondition that api refuses the name first); `>=` 259 only 2; `core.longpaths` ignored only 3; no check in `createWorktree` 4 and 7 (7 is a direct create too); first stderr line only 5; rule 3 removed 6 and 7. Check 5 creates `user/77-x`, not `user/x`: under `{repo}-{id}` a branch with no id renders the folder `api`, the repository itself, and the create stops at `Target path already exists` before git runs. The legacy STWK checks moved unchanged into `legacySection`; they read `SMOKE_CONFIG` (default `%APPDATA%\playground\config.json`) and run with `SMOKE_ONLY=stwk`, or with no `SMOKE_ONLY` when the seed is absent, as before. `SMOKE_TASK_URL` is not set in this session, so they were not run live. Lint 0 errors, 18 warnings (baseline).

**Tests**: manual
**Gate**: manual

**Commit**: `test(worktrees): check the path warning and git's error line in the dialogs`

---

### T18: Smoke: a long title, and the final gate

**What**: `SMOKE_ONLY=slug`, an optional section. Without `SMOKE_LONG_TASK_URL` it prints a skip notice and counts as neither pass nor fail, in a `SMOKE_ONLY=slug` run and in a full run (no `SMOKE_ONLY`) alike; a full run then runs everything else. The URL is never written into the repository, and the slug rule's proof stays with T2's unit tests. With the variable set (refused when the title's previous-rule slug is 40 characters or shorter, computed in the smoke):
- 8 pin it and open Start Work on `api`: the prefilled branch's last segment starts with `{id}-` and its slug is at most 40 characters; when the item has a parent, that segment starts with `{usId}-` and its slug is at most 40; `Create worktree` creates the worktree with `core.longpaths=false`, and it is removed through `worktrees:remove`;
- 9 in the same dialog, a hand-typed name with a ref path of 287 shows the AC 17 text and disables Create.
Then the full gate.
**Where**: `scripts/smoke-start-work.mjs`
**Depends on**: T17
**Reuses**: the legacy pin and dialog probes
**Requirement**: BSLG-08, BSLG-10, BSLG-20, BSLG-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] When `SMOKE_LONG_TASK_URL` is set: each check seen failing on its mutant, then passing: the cap removed from `slugOf` (8, renderer reload); `StartWorkDialog` not gating Create on the problem (9) — **not run**: `SMOKE_LONG_TASK_URL` was not set in this session, so checks 8 and 9 are written but unproven; they need an owner run with the variable
- [x] Without `SMOKE_LONG_TASK_URL`: `SMOKE_ONLY=slug` prints the skip notice and reports the section as neither pass nor fail, and a full run prints the same notice and runs every other section
- [x] The URL and the title never appear in a committed file
- [x] `SMOKE_ONLY=longpath` passes on a fresh seed and launch, and so does `SMOKE_ONLY=slug` when `SMOKE_LONG_TASK_URL` is set — the longpath half; the slug half waits on the variable, as above
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Done** (T18): `slugSection` in `scripts/smoke-start-work.mjs`. Without `SMOKE_LONG_TASK_URL`, `SMOKE_ONLY=slug` printed the skip notice and `0/0 checks passed` (exit 0); a full run on the seed ran checks 1–7 (7/7) and printed the slug and legacy skip notices. With the variable, the section pins the item, refuses a title whose previous-rule slug is 40 characters or fewer, reads Start Work's prefill on `api` (each slug after its id at most 40, the parent segment only when the item has one), then shows check 9 on a typed 287 name in the same dialog, and finally creates the prefilled branch with `core.longpaths=false` and removes it through `worktrees:remove`; its output prints lengths, never the title or the branch. The seed's colliding branch is now `team`, not `user`: the nested template puts every Start Work branch under `user/`, so check 8's create would have hit check 5's collision. Check 5 types `team/77-x`; it passed and was seen failing again on the first-stderr-line mutant (relaunched). Final `SMOKE_ONLY=longpath` 7/7 on a fresh seed and launch. Gate: typecheck 0; lint 0 errors, 18 warnings (baseline); suite 2620 passed; `electron-vite build` exit 0.

**Tests**: manual
**Gate**: manual

**Commit**: `test(tasks): check a long title's suggested branch in Start Work`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1
Phase 2:  T1 ------→ T2
Phase 3:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 4:  T5 ------→ T6 ------→ T7 ------→ T8 ------→ T9
Phase 5:  T9 ------→ T10 -----→ T11
Phase 6:  T11 -----→ T12 -----→ T13 -----→ T14 -----→ T15
Phase 7:  T15 -----→ T16 -----→ T17 -----→ T18
```

Eighteen tasks in seven phases: about three batches (Phases 1–3, 4–5, 6–7). At Execute the sub-agent offer is made first. T1's stop rule gates everything after it.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: measure | 1 doc section, a throwaway probe | ✅ Granular |
| T2: slug | 1 function + 3 test values | ✅ Granular |
| T3: error line | 1 function | ✅ Granular |
| T4: sync | 1 helper removed | ✅ Granular |
| T5: worktree errors | 1 constructor + 1 test | ⚠️ Cohesive (one file, one rule) |
| T6, T7: rules | 2 rules each, 1 function | ✅ Granular |
| T8: reader | 1 function + 1 type | ⚠️ Cohesive |
| T9: guard | 1 call in 1 function | ✅ Granular |
| T10: contract | 1 channel | ✅ Granular |
| T11: wiring | 1 handler | ✅ Granular |
| T12: lib | 2 functions + 1 constant | ✅ Granular |
| T13: hook | 1 hook | ✅ Granular |
| T14, T15: dialogs | 1 component each | ✅ Granular |
| T16: decision | 1 AD + 2 annotations | ⚠️ Cohesive |
| T17, T18: smoke | 1 section each | ✅ Granular |

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
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | docs | none | none | ✅ OK |
| T2 | shared pure module | unit | unit | ✅ OK |
| T3 | main git helper | unit | unit | ✅ OK |
| T4 | main orchestrator (git-sync) | unit | unit | ✅ OK |
| T5 | main orchestrator (worktree-manager) | unit | unit | ✅ OK |
| T6, T7 | main pure rules | unit | unit | ✅ OK |
| T8 | main git reader | unit | unit | ✅ OK |
| T9 | main orchestrator (worktree-manager) | unit | unit | ✅ OK |
| T10 | IPC contract | none | none | ✅ OK |
| T11 | `index.ts` wiring | none | none | ✅ OK |
| T12 | renderer pure lib | unit | unit | ✅ OK |
| T13 | renderer hook | none | none | ✅ OK |
| T14, T15 | components | none (smoke) | none | ✅ OK |
| T16 | docs | none | none | ✅ OK |
| T17, T18 | end to end | manual | manual | ✅ OK |

## Requirement → Evidence Map

Every AC and edge case has its own unit test or numbered smoke check (L-021, L-025):

| Requirement | Evidence |
| ----------- | -------- |
| BSLG-01 | T2 unit (28 fillers, transliterated, near misses) |
| BSLG-02, 33 | T2 unit |
| BSLG-03, 04, 05, 32 | T2 unit (34 / 40 / 41 / 49 characters) |
| BSLG-06, 07, 31 | T2 unit |
| BSLG-08 | T2 unit (the proof); T18 smoke 8 when `SMOKE_LONG_TASK_URL` is set |
| BSLG-09 | T2 unit |
| BSLG-10 | T2 unit (round trip, the proof); T18 smoke 8 when `SMOKE_LONG_TASK_URL` is set |
| BSLG-11 | T2 unit |
| BSLG-12, 13, 43, 44 | T3 unit (synthetic and real) |
| BSLG-14 | T1 measured; T5 unit; T17 smoke 5 |
| BSLG-15 | T3 unit; T4 (existing sync tests, grep) |
| BSLG-16 | T5 unit |
| BSLG-17 | T6, T8 unit; T17 smoke 1 |
| BSLG-18, 36 | T6 unit |
| BSLG-19 | T6 unit; T17 smoke 2 |
| BSLG-20 | T17 smoke 1, 2; T18 smoke 9 when `SMOKE_LONG_TASK_URL` is set |
| BSLG-21 | T6, T8, T9 unit; T17 smoke 3 |
| BSLG-22 | T8 unit |
| BSLG-23 | T12 unit; T17 smoke 2 |
| BSLG-24 | T17 smoke 1 (New worktree); T18 smoke 8, 9 (Start Work, prefilled and typed) when `SMOKE_LONG_TASK_URL` is set |
| BSLG-25 | T9 unit; T17 smoke 4 |
| BSLG-26 | T9 unit and grep |
| BSLG-27 | T7 unit; T17 smoke 6 |
| BSLG-28, 29 | T7 unit |
| BSLG-30 | T9 unit; T17 smoke 7 |
| BSLG-34, 35 | T6 unit; T9 unit (259 created) |
| BSLG-37 | T8, T9 unit |
| BSLG-38 | T9 unit |
| BSLG-39 | T8, T9 unit |
| BSLG-40, 41 | T8 unit |
| BSLG-42 | T12 unit |
