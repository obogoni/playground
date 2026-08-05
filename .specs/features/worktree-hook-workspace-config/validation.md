# Validation — Worktree Post-Create Hook, Out-of-Repo Declaration

**Verdict: PASS** (14/14 ACs verified, 9/12 mutants killed, 3 accepted survivors — all
equivalence artifacts, reasoned below).

| | |
| --- | --- |
| Feature | `worktree-hook-workspace-config` (HWC-01..14) |
| Diff range | `5e22450..38b0cc1` (6 commits after the spec commit `da7ea07`) |
| Production files | `src/main/workspace-config.ts`, `src/main/repo-config.ts`, `src/main/index.ts` |
| Test files | `src/main/workspace-config.test.ts` (+24), `src/main/repo-config.test.ts` (+15) |
| Gate | `npm test` → **605 passed, 1 failed**; `npm run typecheck` clean; `npm run lint` 0 errors / 18 warnings (unchanged pre-existing count); `npm run build` ✓ |
| Gate caveat | The 1 failure is **pre-existing and unrelated** — see "Gate" below |

**Independence caveat, stated up front:** the session harness is configured not to spawn
sub-agents, so this is `validate.md`'s documented **standalone fresh-eyes fallback**, not a
separate Verifier agent. Author ≠ verifier is therefore *not* satisfied — the same context that
wrote the code re-derived the evidence. The discrimination sensor below is the compensating
control: it is mechanical and its result does not depend on the author's mental model.

---

## Per-AC evidence (evidence-or-zero)

`WCT` = `src/main/workspace-config.test.ts`, `RCT` = `src/main/repo-config.test.ts`.

| AC | Spec-defined outcome | `file:line` — assertion | Covered? |
| -- | -------------------- | ----------------------- | -------- |
| HWC-01 | repo's command wins over a workspace entry for the same repo; exactly one runs | `RCT:146` — `expect(resolvePostCreateCommand(repo)).toBe('repo.cmd')` with both levels declared | ✅ |
| HWC-02 | repo declares nothing (any WPC-06 shape) ⇒ `postCreateCommands[<repoName>]` is used | `RCT:138` — `.toBe('workspace.cmd')`; `RCT:160` — same assertion across 5 cases (file absent, key absent, blank, non-string, malformed JSON); reader half `WCT:121` — `.toBe('.\\SetupSkills.cmd < NUL')` | ✅ |
| HWC-03 | workspace = `dirname`, key = `basename`; no signature change | `RCT:138` (fixture is a repo *inside* a workspace dir, so only `dirname`/`basename` can find it) + structural: `git diff --name-only 5e22450..HEAD -- post-create-hook.ts worktree-manager.ts workflow-ctx.ts hook-shell.ts` → **0 files** | ✅ |
| HWC-04 | neither level ⇒ no command, result has no `hook` key | `RCT:165` — `expect(resolvePostCreateCommand(repo)).toBeNull()`; the no-`hook`-key half is WPC-06, unchanged and still asserted at `post-create-hook.test.ts` (`expect('hook' in result).toBe(false)`) | ✅ |
| HWC-05 | absent / unreadable ⇒ null, silent | `WCT:176-177`, `WCT:183-184`, `WCT:188-189` — `.toBeNull()` **and** `expect(logged).toHaveLength(0)` for no-`.app`, no-`config.json`, and a nonexistent workspace | ✅ |
| HWC-06 | malformed JSON ⇒ null + exactly one log naming the file | `WCT:196-198` — `.toBeNull()`, `expect(logged).toHaveLength(1)`, `expect(String(logged[0][0])).toContain(join(dir,'.app','config.json'))` | ✅ |
| HWC-07 | `postCreateCommands` absent / null / string / number / array ⇒ null, no throw | `WCT:171` — `.toBeNull()` across all 5 shapes | ✅ |
| HWC-08 | entry absent / non-string / blank ⇒ null; surrounding whitespace trimmed | `WCT:128` (unlisted repo), `WCT:145` (blank, whitespace-only), `WCT:158` (number, object, array, null, boolean), `WCT:135` — `.toBe('init.cmd')` from `"   init.cmd   "`; also `RCT:171` (workspace names other repos) | ✅ |
| HWC-09 | exact first; unique case-insensitive match used; ≥2 variants ⇒ null + one log | `WCT:205-206` (unique variant resolves, no log), `WCT:213` — `.toBe('exact.cmd')` with `code`+`Code` present, `WCT:220-221` — `.toBeNull()` + `toHaveLength(1)` for `code`+`CODE` | ✅ |
| HWC-10 | `workspaceTemplates` returns exactly the two template keys; resolver ignores them | `WCT:231-235` — `workspacePostCreateCommand(dir,'branchTemplate')` → null, `…(dir,'Code')` → `'init.cmd'`, and `expect(workspaceTemplates(dir)).toEqual({branchTemplate:'task/{id}', worktreeTemplate:'{id}'})` (exact `toEqual` proves no leak) | ✅ |
| HWC-11 | trailing separator resolves identically | `RCT:178` — `expect(resolvePostCreateCommand(\`${repo}${sep}\`)).toBe('workspace.cmd')` | ✅ |
| HWC-12 | drive root / `''` / bare separator ⇒ null, no throw | `RCT:187` — `.toBeNull()` across all three | ✅ (see survivor M3) |
| HWC-13 | repo outside a configured workspace ⇒ null, no registry lookup, no error | `RCT:198` — `.toBeNull()` + `expect(logged).toHaveLength(0)` for a repo two levels deep whose *lexical* parent has no config, while the grandparent names it | ✅ |
| HWC-14 | an on-disk edit lands on the next call (no cache) | `RCT:205,208` — `'first.cmd'` then `'second.cmd'` from the same path; `RCT:214,217` — `'workspace.cmd'` then `'repo.cmd'` after adding a repo declaration | ✅ |

**Spec-precision gaps:** none. Every AC named a concrete expected value and every assertion
targets that value.

**HWC-01's "exactly one command" is structural, not asserted:** `resolvePostCreateCommand`
returns `string | null`, so "both levels ran" is unrepresentable in the type — there is no
second value for the decorator to execute. Recorded as structural rather than claimed as a
test.

---

## Discrimination sensor

12 behaviour-level mutations, applied one at a time to the real production files, tests in scope
re-run, then restored verbatim from the original buffer (`git status --short src/` confirmed
clean afterwards). Script: `scratchpad/sensor.mjs`.

| # | Mutation | Result |
| - | -------- | ------ |
| M1 | precedence dropped — workspace wins instead of repo | **KILLED** (2 tests) |
| M2 | `own !== null` → `own !== undefined` (workspace never consulted) | **KILLED** (9 tests) |
| M3 | drop the empty-`repoName` guard | SURVIVED — accepted |
| M4 | read the repo dir instead of its parent | **KILLED** (9 tests) |
| M5 | key on the workspace name instead of the repo name | **KILLED** (9 tests) |
| M6 | drop the exact-match shortcut | **KILLED** (1 test) |
| M7 | ambiguity returns the first variant instead of none | **KILLED** (1 test) |
| M8 | drop the ambiguity log | **KILLED** (1 test) |
| M9 | drop the malformed-JSON log | **KILLED** (1 test) |
| M10 | stop trimming the command | **KILLED** (2 tests) |
| M11 | accept arrays as the command map | SURVIVED — accepted |
| M12 | `variants.length === 1` → `>= 1` | SURVIVED — equivalent |

**9/12 killed. The three survivors are equivalence artifacts, not weak assertions:**

- **M12 is a provably equivalent mutant.** The preceding `if (variants.length > 1) return null`
  leaves `variants.length ∈ {0,1}`, so `>= 1` and `=== 1` cannot differ. No test can kill it and
  none should try.
- **M3 and M11 are defensive guards whose removal is unobservable through any non-invasive
  fixture.** Without the empty-name guard (M3), a drive-root path falls through to
  `workspacePostCreateCommand('M:\\', '')`, which reads a `M:\.app\config.json` that does not
  exist → still null. Killing it would require authoring a config file at a **drive root** with
  an `""` key. Without the array check (M11), `Object.keys(['x'])` yields `'0'`, which never
  matches a repo name → still null. Both guards make the *intent* explicit and cost nothing;
  strengthening the tests to reach them would mean writing outside the temp fixture (M3) or
  asserting an internal branch rather than a spec outcome (M11).

No mutation that changes a **spec-defined outcome** survived.

---

## Gate

```
npm test        605 passed | 1 failed (606)   ← the 1 failure predates this feature
npm run typecheck  clean
npm run lint       0 errors, 18 warnings      ← identical to the pre-existing count
npm run build      ✓
```

**The single failure is a pre-existing environment defect, not a regression.**
`worktree-manager.test.ts > removeWorktree > force-removes a worktree with mixed dirt and
reports each change` expects `['deleted','modified','untracked']` and receives
`['modified','untracked']`. Established:

1. It fails identically with this feature's changes **stashed** (clean tree, 3 runs), and in
   isolation as well as in the full suite — so it is neither caused by this work nor an L-005
   parallel-load timeout.
2. Root cause is **outside the repo**: on this machine (Node **v24.9.0**), `fs.rmSync` silently
   no-ops — returns without error, file remains — when **any component of the path contains a
   non-ASCII character**. The fixture's temp root is `realpathSync.native(tmpdir())` =
   `C:\Users\OtávioBogoni\…`, so the test's `rmSync(join(sibling,'b.txt'))` never deletes
   `b.txt`; git then correctly reports no deletion. Measured: `b.txt on disk? true`,
   `readdir → .git, a.txt, b.txt, c.txt`.
3. Scope of the Node defect, measured across call shapes: **every** `rmSync` variant
   (bare, `{force}`, `{recursive}`, `{recursive,force}`) no-ops on a non-ASCII path, while
   `unlinkSync` and **every async `rm`** variant work. Confirmed on both `C:` and `M:`, so the
   drive is irrelevant.
4. **The product is unaffected.** `grep -rn "rmSync" src/ --include="*.ts" | grep -v test` →
   no hits; `dir-remover.ts:77` uses async `rm(path, {recursive:true, force:true, maxRetries:0})`,
   which was re-measured against a non-ASCII directory tree and deletes correctly. AD-014's
   delete-first removal is therefore sound as shipped.
5. Side effect worth knowing: 17 test files use `rmSync` for `afterEach` temp-dir teardown, so
   on this machine those cleanups silently leak directories under `%LOCALAPPDATA%\Temp`.

Repro scripts: `scratchpad/repro-{mixed-dirt,variants,deep,rm,sep,product,shapes2}.mjs`.

---

## Success Criteria

| Criterion | Status |
| --------- | ------ |
| `M:\Triade\source\Code\.app\config.json` deleted; the Code repo shows no `?? .app/` | ✅ `git status --short` in that repo no longer lists `.app/` |
| `M:\Triade\source\.app\config.json` declares `postCreateCommands: { "Code": ".\\SetupSkills.cmd < NUL" }` | ✅ written; `M:\Triade\source` is not itself a git repo, so the file is outside version control |
| The real resolver returns that command for the real repo | ✅ production `resolvePostCreateCommand` bundled with esbuild and run against the real files: `M:\Triade\source\Code` → `".\\SetupSkills.cmd < NUL"`; with a trailing `\` → same; `…\Library` → `null`; `M:\obogoni\playground` → `null`; `M:\` → `null` |
| A repo with neither config behaves byte-identically | ✅ `repo-config`, `workspace-config`, `post-create-hook` and `worktree-manager` suites pass unmodified apart from the added describes |
| README documents both sites and the precedence | ✅ `38b0cc1` |
| **Creating a worktree from the dialog leaves the junctions in place** | ✅ **DISCHARGED 2026-08-04** — see the end-to-end run below. |

---

## End-to-end run (2026-08-04) — the last Success Criterion

Driven over CDP against the dev app (`npm run dev -- -- --remote-debugging-port=9222`), the same
technique the `scripts/smoke-*.mjs` files use. The dev build reads its own userData
(`%APPDATA%\playground`, distinct from the installed nightly's `%APPDATA%\playground-nightly`), so
that directory was seeded with a copy of the nightly `config.json` to get the real workspaces.

| Step | Result |
| ---- | ------ |
| Workspace `M:\Triade\source` with repo `Code` visible via `tree:get` | ✅ |
| New Worktree dialog opens from the sidebar, `Code` chip pre-selected, base `develop` | ✅ |
| Base refresh **unchecked** — `develop` is dirty in that repo, so `refreshBaseFromRemote`'s in-place ff-merge would abort and block the create | ✅ deliberate |
| Branch `chore/99999-hook-check` → path preview `M:\Triade\source\Code-99999` | ✅ |
| Create completes with **no** `HookFailureNotice` and no inline error (~75 s: worktree add on a 3 GB repo + the script) | ✅ |
| Dialog closes and the new worktree is selected in the sidebar | ✅ (`.sidebar-worktree.selected` → `chore/99999-hook-check`) |
| `<worktree>\.claude\skills` is a reparse point → `M:\Triade\source\Code-99999\.github\skills`, 14 entries | ✅ |
| `<worktree>\.codex\skills` is a reparse point → the same target, 14 entries | ✅ |

This is the first time the two halves ran as one flow: the workspace-level declaration was the
**only** source of the command (`M:\Triade\source\Code\.app\config.json` stays deleted), so the
junctions landing in the new worktree is direct evidence that `resolvePostCreateCommand`'s
workspace fallback reached `withPostCreateHook` through the real dialog path.

**Incidental finding, not a defect.** The first attempt used branch `chore/hook-check` and the
create was refused with `Target path already exists: M:\Triade\source\Code`. Cause: the global
`ado.worktreeTemplate` is `{repo}-{id}`, and a branch with no task number renders `{id}` to `''`,
so `worktreeNameFor` sanitizes `Code-` down to `Code` — the repo's own folder. The existing
empty-render / collision guard caught it and kept the dialog open with a readable error, which is
the documented behaviour of `worktreeNameFor` ("May render to '' — callers guard that"). Worth
knowing when hand-testing: with that template, always use a branch carrying a 2+ digit number.

**Cleanup.** `M:\Triade\source\Code-99999` was deleted with async `fs.rm` (delete-first, per
AD-014 — never `git worktree remove` as the deleter, since git for Windows recurses into
junctions), then `git worktree prune --expire now` (the bare `prune` is a no-op here:
`gc.worktreePruneExpire` defaults to 3 months) and `git branch -D chore/99999-hook-check`. The
`Code` repo is back to its original 10 worktrees and its own `.github\skills` still holds 14
entries.

---

## Lessons

**None recorded.** Per `lessons.md`, only grounded execution signals qualify: there were no
failed ACs, no spec-precision gaps, no `SPEC_DEVIATION` markers, and no surviving mutant that
indicates a weak assertion (the three survivors are equivalence artifacts). The `rmSync` finding
is an environment defect on one machine, not a project-local execution lesson, and the
`TESTING.md:15` naming slip corrected in `67a4dd0` was caught by the process working as intended
— recording it would be a methodology note, which `lessons.md` explicitly excludes.
