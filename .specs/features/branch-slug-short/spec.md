# Branch Slug Short Specification

## Problem Statement

Starting work on a task with a long title fails. The nested branch template
(`user/{dev}/{usId}-{usSlug}/{id}-{slug}`) turns the parent story's title and the task's title into
slugs with no length limit (`slugOf`, `src/shared/tasks.ts:10-17`), so two long titles make a branch
of 200+ characters. Git stores the branch as a file under `.git/refs/heads/…`, and on Windows that
path passes the 260-character limit: `git worktree add` exits with
`Preparing worktree (new branch '…')` and then
`fatal: cannot lock ref 'refs/heads/…': unable to create directory for .git/refs/heads/…`.

The dialog then shows only the first stderr line (`gitFailureLine`, `src/main/git.ts:45-50`), which
is git's progress note, not the error. The user sees a failure with nothing that points at the name
being too long. Scope is upstream issue #145, grilled and approved by the owner on 2026-10-01.

## Goals

- [ ] A task with two long titles gets a suggested branch whose `{slug}` and `{usSlug}` are at most 40 characters each, and its worktree is created
- [ ] Every git failure the app shows is git's own `fatal:` or `error:` line when git wrote one
- [ ] A name that would pass a Windows path limit is refused in the dialog, with its length and the way out, before git runs, unless `core.longpaths` lifts that limit
- [ ] Existing branches and worktrees keep working and keep their names

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Timeouts on the base fetch and the checkout | Issue #145: tracked separately |
| Renaming existing branches or worktrees | Issue #145 |
| A setting for the 40-character cap or the filler-word list | Issue #145: both are fixed in code |
| Setting `core.longpaths` on the user's behalf | Issue #145: a branch created that way breaks every git that reads it without the setting (the IDE's, the agents') |
| Checking the paths of the repository's own files inside the new worktree | Depends on the repository's deepest file; git's `error:` line reports it (BSLG-12) |
| Shortening `{type}`, `{id}`, `{dev}`, `{usId}` or the template text | Issue #145: the rule applies to `{slug}` and `{usSlug}` only |

This feature **amends** two merged specs: `start-work-from-task` STWK-01 AC 2 (the slug rule gains
the filler, repeat and cap steps) and `status-bar`'s error-reporting row (the `fatal:`/`error:`
preference moves from `git-sync.ts` into `gitFailureLine`, for every caller). Recorded at Execute as
an AD in `.specs/STATE.md` (AD-056, recorded at T16).

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Scope | Upstream issue #145, as written | Grilled and approved by the owner | owner confirmed 2026-10-01 |
| Slug rule | Drop filler words, collapse a word repeated back to back, cut to 40 characters at a word boundary | Issue #145, Solution 1 | owner confirmed 2026-10-01 |
| Filler words | `a, o, os, as, de, do, da, dos, das, em, no, na, com, para, por, e, ou, um, uma, via, the, of, to, in, on, for, and, or, with`, fixed in code; numbers are kept | Issue #145, Implementation Decisions; `via` added by the owner on 2026-10-03, at Execute, because AC 3 and AC 4's titles need it dropped | owner confirmed 2026-10-01; `via` 2026-10-03 |
| Cap | 40 characters per slug, cut at the last `-` at or before 40; a single word longer than 40 is cut at 40 | Issue #145 | owner confirmed 2026-10-01 |
| Empty after dropping | Falls back to the full slug | Issue #145 | owner confirmed 2026-10-01 |
| Where the rule applies | `{slug}` and `{usSlug}` only; the `{id}-` at the start of a segment is never cut | Issue #145; the task id is still read back from the branch | owner confirmed 2026-10-01 |
| Error line | `gitFailureLine` prefers git's first `fatal:` or `error:` line; the first non-empty line only when there is none | Issue #145, Solution 2 | owner confirmed 2026-10-01 |
| Where the check runs | In main: the dialog asks as the name changes (debounced) and `worktrees:create` runs the same check, so a create that skips the dialog fails with the same message | Issue #145 | owner confirmed 2026-10-01 |
| Ref path | The repository's common git dir + `refs/heads/` + the branch + `.lock` | Issue #145 | owner confirmed 2026-10-01 |
| When the check is skipped | When the repository's effective `core.longpaths` is `true`, and on every platform but Windows | Issue #145 | owner confirmed 2026-10-01 |
| The app and `core.longpaths` | The app never sets it, neither in config nor as `-c` on a command | Issue #145 | owner confirmed 2026-10-01 |
| Existing branches and worktrees | Not renamed | Issue #145 | owner confirmed 2026-10-01 |
| Ref path limit | A ref path of 259 characters passes; 260 or more is refused | Measured on 2026-10-01 (design.md, Measurements): 259 is created, 260 fails with `Filename too long` | owner confirmed 2026-10-01 |
| Message wording | `The branch's ref path is {n} characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.` | The issue's example says "over Windows' 260", which reads wrong for a path of exactly 260, the first refused length | owner confirmed 2026-10-01 |
| Reflog folder | Also refused: the folder `<common git dir>\logs\refs\heads\<the branch's folders>` at 248 characters or more, with its own message (BSLG-17) | Measured: git creates that folder for the branch's reflog, Windows refuses a folder path of 248 or more, and it binds before the ref path when the last segment is short (design.md, Measurements). Same remedy as the ref path | owner confirmed 2026-10-01 |
| Worktree folder under the default template | Covered (P2): the worktree folder path and the worktree's git folder are checked too (BSLG-27..30) | Measured: under `{repo}-{branch}` a long name fails on the folder before the ref, once with `fatal: '$GIT_DIR' too big` (not lifted by `core.longpaths`) and once with a line that has no `fatal:` prefix, which the error-line rule (BSLG-12, BSLG-13) cannot surface. The owner's template `{repo}-{id}` never reaches these limits. Dropping P2 removes T7 and smoke checks 6–7 only | owner confirmed 2026-10-01 |
| Empty-after-dropping fallback and the cap | The full slug also gets the repeat and cap rules | The goal is a short name; a title of only filler words can still be long | owner confirmed 2026-10-01 |
| Repeat rule order | A repeat is collapsed after the filler words are dropped, so `Validação de validação` gives `validacao` | Dropping fillers can bring two equal words together; leaving them reads as a typo | owner confirmed 2026-10-01 |
| Filler match | After the existing transliteration and lowercasing, so `à` and `às` count as `a` and `as` | The slug already transliterates; matching before it would keep `a` from `à` | owner confirmed 2026-10-01 |
| Branch that already exists | The ref-path and reflog rules apply only when the create writes a new local ref: a new branch from a base, Recreate, or no base for a branch that has no local ref yet. Checking out an existing local branch (no base, or Reuse) skips them | Git does not write that ref then; refusing would block a branch git accepts | owner confirmed 2026-10-01 |
| Recreate | The check runs before the branch is deleted | A refusal after `git branch -D` would lose the branch | owner confirmed 2026-10-01 |
| `core.longpaths` value | Read as a boolean (`git config --type=bool --get core.longpaths`), so `yes`, `on` and `1` count as `true`. A value git cannot read as a boolean makes git refuse every command the check and the create run (measured 2026-10-03, design.md Measurements), so the check gives no message and git's own `fatal: bad boolean config value …` line reaches the dialog | The issue says "effective core.longpaths is true"; git itself accepts every boolean spelling | owner confirmed 2026-10-01; owner amended 2026-10-03 |
| A check that cannot read the repository | Reports nothing; the create goes on and git reports its own error | The check guards one known failure; it must not invent a new one | owner confirmed 2026-10-01 |
| Debounce | 250 ms after the last change to the branch, the repository or the worktree template | Short enough to feel live, long enough not to run git per keystroke | owner confirmed 2026-10-01 |
| While a check is pending | Create stays enabled; only an answer for the current values disables it | `worktrees:create` runs the same check, so a fast click is still refused with the same message | owner confirmed 2026-10-01 |
| Where the message shows | One line with the alert icon under the path preview, in both dialogs | Next to the path it talks about; the existing create error stays below for git's failures | owner confirmed 2026-10-01 |
| Repo listing errors | `GitError` (a repo whose worktrees cannot be listed) also takes its detail from `gitFailureLine` | "Every git failure in the app" (user story 6); today it shows execFile's `Command failed: git …` line | owner confirmed 2026-10-01 |
| Long-title smoke check | Optional. When `SMOKE_LONG_TASK_URL` is set, the slug section runs against that real work item, like the existing `SMOKE_TASK_URL`, and its title must slug to more than 40 characters. Without the variable the section is skipped with a printed notice and counts as neither pass nor fail, in a `SMOKE_ONLY=slug` run and in a full run alike. The slug rule's proof is its unit tests (BSLG-01..11) | Task details come only from Azure DevOps; the app has no fake source. The URL is never written into the repository | owner confirmed 2026-10-01 |

**Open questions:** none unlogged. The owner confirmed every row above on 2026-10-01.

---

## User Stories

### P1: Concise slugs ⭐ MVP

**User Story**: As a developer starting work on a task with a long title, I want the suggested branch to be short and still recognisable, with the task id where the app reads it, so that the worktree is created and stays linked to its task.

**Why P1**: The request; issue user stories 1–4.

**Acceptance Criteria**:

1. WHEN `branchNameFor` renders `{slug}` or `{usSlug}` THEN it SHALL leave out every word of the filler list, compared after transliteration and lowercasing
2. WHEN two neighbouring words are equal after the filler words are left out THEN the slug SHALL keep one of them (`Fix fix login` → `fix-login`; `Validação de validação` → `validacao`)
3. IF the remaining words join to more than 40 characters THEN the slug SHALL be the longest run of leading whole words that is at most 40 characters (`Revisar fluxo de pagamento recorrente via bancos` → `revisar-fluxo-pagamento-recorrente`, 34)
4. WHEN the remaining words join to exactly 40 characters THEN the slug SHALL keep all of them (`Revisar fluxo de pagamento recorrente via banco` → `revisar-fluxo-pagamento-recorrente-banco`, 40)
5. IF the first remaining word alone is longer than 40 characters THEN the slug SHALL be its first 40 characters
6. IF leaving out the filler words leaves no word THEN the slug SHALL be built from all the title's words, with AC 2, 3 and 5 applied (`De a para` → `de-a-para`)
7. The slug SHALL keep numbers, single digits included (`Migrar para v2 em 3 etapas` → `migrar-v2-3-etapas`)
8. WHEN the title is `Ajustar a validação dos campos do cadastro de clientes com o novo serviço de endereços` THEN the slug SHALL be `ajustar-validacao-campos-cadastro`
9. The rule SHALL change `{slug}` and `{usSlug}` only; `{type}`, `{id}`, `{dev}`, `{usId}`, the template's literal text and the per-segment trimming SHALL render as today
10. WHEN a branch is rendered from a template whose last segment starts with `{id}-` THEN `taskIdFromBranch` and `taskIdFromTemplate` SHALL return the task id, for long, filler-only and empty titles alike
11. WHEN a worktree's branch was made by the previous rule (`feature/4821-configuracao-de-ambiente`) THEN `taskIdFromBranch` and `taskIdFromTemplate` SHALL still return its task id

**Independent Test**: Render the nested template for a task and a parent with the AC 8 title; both slugs are at most 40 characters and the task id is read back.

---

### P1: Git's real error ⭐ MVP

**User Story**: As a developer, I want every git failure the app shows to be git's own error line, so that I know what went wrong instead of reading a progress note.

**Why P1**: Issue user stories 5–6; the failure that started the issue showed `Preparing worktree …` as its reason.

**Acceptance Criteria**:

12. WHEN git's stderr holds a line that starts with `fatal:` or `error:` after trimming THEN `gitFailureLine` SHALL return the first such line, trimmed
13. IF stderr holds no such line THEN `gitFailureLine` SHALL return its first non-empty line, trimmed, and, with no stderr text, the error message's first line, as today
14. WHEN `git worktree add` fails after printing `Preparing worktree (new branch '…')` THEN the create SHALL return git's `fatal:` line as its error, and the dialog SHALL show that line
15. The status bar's sync operations, the Files lists, diffs, commits and discard, and the worktree create and remove SHALL report a git failure through `gitFailureLine`, with no second extractor of their own
16. WHEN listing a repository's worktrees fails THEN the repository's error in the tree SHALL read `git failed in {repoPath}: {gitFailureLine}`

**Independent Test**: Create a worktree for `user/x` in a repository that has a branch `user`; the result's error is git's `fatal: cannot lock ref …` line, not `Preparing worktree …`.

---

### P1: Check before creating ⭐ MVP

**User Story**: As a developer typing or accepting a long name, I want the dialog to tell me before git runs that the name is too long for Windows, how long it is and how to fix it, so that I do not end up with a half-made worktree, while a repository with `core.longpaths` enabled still accepts it.

**Why P1**: Issue user stories 7–9.

The **ref path** is the repository's common git dir, then `\refs\heads\`, then the branch with each
`/` as `\`, then `.lock`. The **reflog folder** is the common git dir, then `\logs\refs\heads\`, then
the branch's folders (everything before its last `/`), for a branch that has a `/`.

**Acceptance Criteria**:

17. WHILE the platform is Windows and the repository's effective `core.longpaths` is not true, WHEN the name in the dialog makes a ref path of 260 characters or more THEN the dialog SHALL show `The branch's ref path is {n} characters, over Windows' limit of 259. Shorten the name, or enable core.longpaths in the repository.`, `{n}` being the ref path's length
18. WHILE the platform is Windows and the repository's effective `core.longpaths` is not true, WHEN the name makes a reflog folder of 248 characters or more and a ref path of 259 or fewer THEN the dialog SHALL show `The branch's reflog folder path is {n} characters, over Windows' limit of 247 for a folder. Shorten the name, or enable core.longpaths in the repository.`
19. WHEN the ref path is 259 characters or fewer and the reflog folder 247 or fewer THEN the dialog SHALL show no path message
20. WHILE the dialog shows a path message, its `Create worktree` button SHALL be disabled
21. WHERE the repository's effective `core.longpaths` is true, the dialog SHALL show neither message of AC 17–18 and SHALL keep `Create worktree` enabled for that name
22. WHERE the platform is not Windows, the app SHALL run no path check
23. WHEN the branch name, the repository or the effective worktree template changes THEN the dialog SHALL ask again 250 ms after the last change, and SHALL show only an answer given for the values in the dialog at that moment
24. The check SHALL cover the prefilled name and a name typed by hand, in the Start Work dialog and in the New worktree dialog
25. WHEN `worktrees:create` receives a name the check refuses THEN it SHALL return `{ ok: false, error }` with the same message, before any git command that writes (no base refresh, no branch delete, no `worktree add`), and SHALL leave no new folder, branch or worktree
26. The app SHALL NOT write `core.longpaths` to any git config, nor pass it to a git command with `-c`

**Independent Test**: In a repository with `core.longpaths=false`, type a name whose ref path is 287 characters: the message reads `… is 287 characters …` and `Create worktree` is disabled; set the repository's `core.longpaths=true` and the message goes away.

---

### P2: Folder check under a long worktree template

**User Story**: As a developer whose worktree template puts the branch in the folder name (`{repo}-{branch}`, the default), I want a name that makes the folder too long to be refused the same way, so that git's folder failure does not reach me as a bare progress note.

**Why P2**: The owner's `{repo}-{id}` template never reaches these limits, and the issue settles the ref path only; measured on the default template, a long name fails on the folder first (design.md, Measurements). Owner confirmed 2026-10-01.

The **worktree folder path** is the path the dialog previews. The **worktree's git folder** is the
common git dir, then `\worktrees\`, then the worktree folder's name, then `\refs`.

**Acceptance Criteria**:

27. WHILE the platform is Windows, WHEN the worktree folder path is 216 characters or more THEN the dialog SHALL show `The worktree folder path is {n} characters, over the 215 git accepts. Shorten the name, or use a shorter worktree template such as {repo}-{id}.`, whatever `core.longpaths` holds
28. WHILE the platform is Windows and the repository's effective `core.longpaths` is not true, WHEN the worktree's git folder is 248 characters or more THEN the dialog SHALL show `The worktree's git folder path is {n} characters, over Windows' limit of 247 for a folder. Shorten the name, use a shorter worktree template, or enable core.longpaths in the repository.`
29. WHEN more than one limit is passed THEN the dialog SHALL show the message of the first in this order: ref path, reflog folder, worktree folder, worktree's git folder
30. WHEN `worktrees:create` receives a name refused by AC 27 or 28 THEN it SHALL refuse as in AC 25, with that message

**Independent Test**: With the default template and `core.longpaths=true`, type a name whose folder path is 230 characters; the folder message shows and `Create worktree` is disabled.

---

## Edge Cases

Each carries an ID and its own test or numbered smoke check (L-025).

- **BSLG-31** WHEN the title is empty or only symbols (`!!!`) THEN the slug SHALL be empty and the segment SHALL be trimmed as today (`feature/4821`)
- **BSLG-32** WHEN a single word is exactly 40 characters THEN the slug SHALL keep it whole, and at 41 SHALL keep its first 40
- **BSLG-33** WHEN equal words are separated by a word that is not a filler (`login fix login`) THEN the slug SHALL keep both
- **BSLG-34** WHEN the branch has no `/` THEN the reflog folder rule SHALL NOT apply, and the ref path rule SHALL
- **BSLG-35** WHEN the ref path is exactly 259 characters THEN the check SHALL pass, and at exactly 260 SHALL refuse
- **BSLG-36** WHEN the reflog folder is exactly 247 characters THEN the check SHALL pass, and at exactly 248 SHALL refuse
- **BSLG-37** WHEN the branch exists locally and the create checks it out as it is (no base, or Reuse) THEN the ref path and reflog rules SHALL NOT refuse it
- **BSLG-38** WHEN the user chooses Recreate for a name the ref path rule or the reflog folder rule refuses THEN the create SHALL refuse with that rule's message (AC 17 or AC 18) and the existing branch SHALL still exist. Restated on 2026-10-03 after validation: a branch past the ref path rule is invisible to git with `core.longpaths` off, so only the reflog folder shape reaches Recreate's `branch -D`
- **BSLG-39** IF the repository's `core.longpaths` holds a value git cannot read as a boolean THEN git refuses the commands the check and the create run, the check SHALL report no message, and the create SHALL return git's `fatal: bad boolean config value …` line
- **BSLG-40** WHEN `core.longpaths` is `true` in the global config and `false` in the repository's own config THEN the check SHALL refuse a ref path of 260 or more (the repository's value wins)
- **BSLG-41** IF the path check cannot read the repository (not a git repository, git missing) THEN it SHALL report no message and the create SHALL return git's own error
- **BSLG-42** WHEN an answer arrives for a name the dialog no longer shows THEN the dialog SHALL ignore it
- **BSLG-43** WHEN the stderr holds `error:` before `fatal:` THEN `gitFailureLine` SHALL return the `error:` line (the first of either)
- **BSLG-44** WHEN a line contains `fatal:` but does not start with it after trimming (`hint: fatal: …`) THEN `gitFailureLine` SHALL NOT pick it

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| BSLG-01 | P1: slugs, AC 1 | Tasks | Done: T2; recorded in AD-056 (T16) |
| BSLG-02 | P1: slugs, AC 2 | Tasks | Done: T2 |
| BSLG-03 | P1: slugs, AC 3 | Tasks | Done: T2 |
| BSLG-04 | P1: slugs, AC 4 | Tasks | Done: T2 |
| BSLG-05 | P1: slugs, AC 5 | Tasks | Done: T2 |
| BSLG-06 | P1: slugs, AC 6 | Tasks | Done: T2, follow-up 2 |
| BSLG-07 | P1: slugs, AC 7 | Tasks | Done: T2 |
| BSLG-08 | P1: slugs, AC 8 | Tasks | Done: T2 (the proof); T18 (smoke 8) written, optional, not run: `SMOKE_LONG_TASK_URL` unset |
| BSLG-09 | P1: slugs, AC 9 | Tasks | Done: T2 |
| BSLG-10 | P1: slugs, AC 10 | Tasks | Done: T2 (the proof); T18 (smoke 8) written, optional, not run: `SMOKE_LONG_TASK_URL` unset |
| BSLG-11 | P1: slugs, AC 11 | Tasks | Done: T2 |
| BSLG-12 | P1: error, AC 12 | Tasks | Done: T3; recorded in AD-056 (T16) |
| BSLG-13 | P1: error, AC 13 | Tasks | Done: T3 |
| BSLG-14 | P1: error, AC 14 | Tasks | Done: T5, T17 (smoke 5) |
| BSLG-15 | P1: error, AC 15 | Tasks | Done: T3, T4 |
| BSLG-16 | P1: error, AC 16 | Tasks | Done: T5 |
| BSLG-17 | P1: check, AC 17 | Tasks | Done: T6, T8, T17 (smoke 1); recorded in AD-056 (T16) |
| BSLG-18 | P1: check, AC 18 | Tasks | Done: T6 |
| BSLG-19 | P1: check, AC 19 | Tasks | Done: T6, T17 (smoke 2) |
| BSLG-20 | P1: check, AC 20 | Tasks | Done: T14, T15, T17 (smoke 1, 2); T18 (smoke 9) written, optional, not run: `SMOKE_LONG_TASK_URL` unset |
| BSLG-21 | P1: check, AC 21 | Tasks | Done: T6, T8, T9, T17 (smoke 3) |
| BSLG-22 | P1: check, AC 22 | Tasks | Done: T8, follow-up 3 |
| BSLG-23 | P1: check, AC 23 | Tasks | Done: T10, T11, T12, T13, T17 (smoke 2) |
| BSLG-24 | P1: check, AC 24 | Tasks | Done: T11, T14, T15, T17 (smoke 1); T18 (smoke 9) written, optional, not run: `SMOKE_LONG_TASK_URL` unset |
| BSLG-25 | P1: check, AC 25 | Tasks | Done: T9, T17 (smoke 4), follow-up 1 |
| BSLG-26 | P1: check, AC 26 | Tasks | Done: T9 |
| BSLG-27 | P2: folder, AC 27 | Tasks | Done: T7, T17 (smoke 6) |
| BSLG-28 | P2: folder, AC 28 | Tasks | Done: T7 |
| BSLG-29 | P2: folder, AC 29 | Tasks | Done: T7 |
| BSLG-30 | P2: folder, AC 30 | Tasks | Done: T9, T17 (smoke 7) |
| BSLG-31 | Edge: empty title | Tasks | Done: T2 |
| BSLG-32 | Edge: 40-character word | Tasks | Done: T2 |
| BSLG-33 | Edge: non-adjacent repeat | Tasks | Done: T2 |
| BSLG-34 | Edge: no `/` | Tasks | Done: T6 |
| BSLG-35 | Edge: ref path 259 / 260 | Tasks | Done: T6, T9 |
| BSLG-36 | Edge: reflog folder 247 / 248 | Tasks | Done: T6 |
| BSLG-37 | Edge: existing branch | Tasks | Done: T8, T9 |
| BSLG-38 | Edge: Recreate | Tasks | Done: T9, follow-up 1 |
| BSLG-39 | Edge: non-boolean value | Tasks | Done: T8, T9 |
| BSLG-40 | Edge: repository value wins | Tasks | Done: T8 |
| BSLG-41 | Edge: unreadable repository | Tasks | Done: T8 |
| BSLG-42 | Edge: stale answer | Tasks | Done: T12 |
| BSLG-43 | Edge: `error:` before `fatal:` | Tasks | Done: T3 |
| BSLG-44 | Edge: `fatal:` inside a line | Tasks | Done: T3 |

**Coverage:** 44 total, 44 mapped to tasks (tasks.md, Requirement → Evidence Map), 0 unmapped.

---

## Success Criteria

- [ ] Start Work on a task and a parent with 80-character titles, nested template, creates the worktree on Windows with `core.longpaths` off
- [ ] No dialog shows `Preparing worktree …` as a failure reason
- [ ] A hand-typed name that would fail on the ref path never reaches `git worktree add`

---

## Follow-ups

Recorded by the Verifier on 2026-10-03 (validation.md: PASS; production code correct, gaps in tests and smoke only):

1. **Closed 2026-10-03** (owner asked for 1–3 before the PR). BSLG-25 ("no branch delete") and BSLG-38: test a Recreate of a branch git can see (reflog folder 248, ref
   path 251) through `createWorktree`, expecting the reflog message and an unchanged tip. Restate BSLG-38 at that
   shape: git cannot see a branch with a ref path of 260 or more under `core.longpaths=false`, so today's case
   never reaches Recreate's `branch -D`.
2. **Closed 2026-10-03.** BSLG-06: assert repeat collapse inside the filler-only fallback (`De de para` → `de-para`).
3. **Closed 2026-10-03.** BSLG-22: test the platform gate on `darwin` as well as `linux`.
4. BSLG-23 / BSLG-42: smoke a repository change from an accepted to a refusing repository, and a template change.
   Prove the hook's stale-answer guard with a hook-level test or a smoke race.
5. BSLG-08/10/20/24: owner run of T18 checks 8–9 with `SMOKE_LONG_TASK_URL` set (optional by owner decision).
6. BSLG-41: test the "git missing" arm (a rejecting `git` stub returns `null`).
