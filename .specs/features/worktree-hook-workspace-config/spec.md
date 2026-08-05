# Worktree Post-Create Hook — Out-of-Repo Declaration Specification

## Problem Statement

AD-013 put the post-create hook command inside the repo it initializes:
`<repoPath>\.app\config.json`, key `postCreateCommand`. For `M:\Triade\source\Code` that means a
permanent `?? .app/` in `git status` unless the file is committed — and committing it needs a PR
into a shared team repo just to record one developer's local automation. The owner wants the
declaration **outside** the repo, in the workspace that already owns a config file
(`<workspace>\.app\config.json`, read today by `workspaceTemplates`), keyed by repo name because
one workspace holds many repos.

## Goals

- [ ] A repo's init command can be declared **outside that repo**, in
      `<workspace>\.app\config.json` under `postCreateCommands[<repoName>]`, and runs on every
      successful worktree create for that repo — from all three create paths.
- [ ] Zero behavior change for a repo that declares its own `postCreateCommand`: the in-repo
      declaration still wins, so AD-013 is **extended, not reversed**.
- [ ] Zero behavior change when neither level declares anything (still **no `hook` key** on the
      result).
- [ ] Exactly one command runs per create — never both levels.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                                              | Reason                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing the in-repo reader                                          | Owner decision: repo wins, workspace is the fallback. Dropping `repoPostCreateCommand` would reverse AD-013 decision 1 and break any repo already declaring one.                                                                              |
| A workspace-wide default (`"*"` key) or a bare workspace-level string | Owner decision: **per-repo keys only**. A default would make a newly cloned repo silently inherit a command — the opposite of what moving the declaration out of the repo is meant to achieve (explicit, owner-authored automation).           |
| App-global (userData `config.json`) declaration + settings-dialog UI  | Considered and rejected as the location. It would be per-machine and invisible to teammates, and needs a settings surface to be editable at all. The workspace file is hand-authored today, exactly like the template keys beside it.          |
| Registry validation of the derived workspace                          | The workspace is derived **lexically** from `repoPath`; no lookup against `AppConfig.workspaces`. A registry lookup would couple a pure file reader to app state for no behavioral gain (HWC-13 defines the outcome when derivation misses).   |
| Changing anything about how the command runs                          | `cwd`, the `PLAYGROUND_*` env, the 120 s timeout, the 4000-char output tail, the run-iff-created rule and the keep-the-worktree failure semantics are all unchanged (WPC-01..05, WPC-08..11). This feature changes **only where the string comes from**. |
| A trust prompt / allowlist for the workspace-declared command         | Out of scope for the same reason as AD-013 — but note the risk **shrinks** here: a workspace file is authored by the machine's owner, not shipped by repo content.                                                                             |
| Migrating existing in-repo declarations automatically                 | There is exactly one in the world (`M:\Triade\source\Code\.app\config.json`, written this session). It is moved by hand as an Execute task, not by code.                                                                                      |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision                                     | Chosen default                                                                                          | Rationale                                                                                                                                                                                                                                                                                             | Confirmed? |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Where the out-of-repo command lives                       | `<workspace>\.app\config.json`, new key `postCreateCommands: { "<repoName>": "<cmd>" }`                 | The file already exists as a concept and is already hand-authored for `branchTemplate`/`worktreeTemplate`. No third config-file concept; nothing new to discover.                                                                                                                                      | **y**      |
| Precedence                                                | Repo wins; workspace is the fallback                                                                    | Additive and backward-compatible — WPC-01/WPC-06 keep holding verbatim, so no existing test or behavior changes.                                                                                                                                                                                       | **y**      |
| Reach of a workspace entry                                | Per-repo keys only; no default for unlisted repos                                                       | Explicit beats convenient: a repo cloned into the workspace runs nothing until it is named.                                                                                                                                                                                                            | **y**      |
| How the workspace path and repo name are obtained         | Lexically: `dirname(repoPath)` and `basename(repoPath)` (win32)                                          | `scanRepos` is a **single-level** scan (`repo-scanner.ts:20-38`) — a repo is always a direct child of its workspace — so both are derivable from the `repoPath` the reader already receives. `readCommand(repoPath)` keeps its signature and `withPostCreateHook` is untouched.                        | y (agent)  |
| Repo-name key matching                                    | Exact match first; else a **unique** case-insensitive match; two-or-more case-insensitive matches → none | Windows folder names are case-insensitive and the app is Windows-only (AD-005), so `"code"` for a folder named `Code` is a slip, not a different repo — silently running nothing would be the trap this feature exists to remove. Ambiguity resolves to "no command" rather than an arbitrary winner. | y (agent)  |
| Malformed workspace JSON                                  | One `console.error` naming the file, then fall back to no command                                       | Exact parity with WPC-07 and `workspaceTemplates`. The same file being read by two readers may log twice per resolution; each reader logging its own ignore is honest and neither swallows.                                                                                                            | y (agent)  |
| Caching                                                   | None — read on use, both levels                                                                         | Matches both existing readers; an on-disk edit takes effect at the next create with no restart.                                                                                                                                                                                                        | y (agent)  |
| The `M:\Triade\source\Code\.app\config.json` written today | Deleted, and its command moved to `M:\Triade\source\.app\config.json`                                    | It is the artifact this feature exists to relocate; leaving it would mean the repo-wins rule keeps the file authoritative and the feature would be untested in real use.                                                                                                                               | **y**      |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The init command can be declared outside the repo ⭐ MVP

**User Story**: As a developer, I want to declare a repo's worktree init command in my workspace
config instead of inside the repo, so that automation for a shared team repo needs no commit, no
PR, and leaves no untracked file in `git status`.

**Why P1**: This is the entire feature.

**Acceptance Criteria**:

1. **HWC-01** — WHEN a create succeeds for `<repoPath>` AND `<repoPath>\.app\config.json` declares
   a non-blank string `postCreateCommand` THEN the **repo's** command SHALL be executed, even if
   `<dirname(repoPath)>\.app\config.json` maps a *different* command for `basename(repoPath)`, AND
   **exactly one** command SHALL be executed (never both).
2. **HWC-02** — WHEN the repo declares no command (per WPC-06: file absent, unreadable, malformed,
   or key missing / blank / whitespace-only / not a string) AND
   `<dirname(repoPath)>\.app\config.json` maps `basename(repoPath)` to a non-blank string under
   `postCreateCommands` THEN that command SHALL be executed, with `cwd` = the created worktree and
   the identical env (`PLAYGROUND_WORKTREE_PATH`/`_REPO_PATH`/`_BRANCH`), 120 000 ms timeout and
   4000-char output tail already specified by WPC-01/02/05/09/11.
3. **HWC-03** — WHEN the command is resolved THEN the workspace directory SHALL be
   `dirname(repoPath)` and the repo key SHALL be `basename(repoPath)` — derived lexically from the
   `repoPath` already passed to `readCommand`, with **no** change to that signature, to
   `withPostCreateHook`, or to `worktree-manager.ts`.
4. **HWC-04** — WHEN neither level declares a command THEN NO command SHALL be executed AND the
   returned `CreateWorktreeResult` SHALL have **no `hook` property** (WPC-06 preserved byte-for-byte).
5. **HWC-05** — WHEN `<workspace>\.app\config.json` is absent or unreadable THEN the resolution
   SHALL yield no command, SHALL NOT throw, and SHALL log nothing.
6. **HWC-06** — WHEN `<workspace>\.app\config.json` is malformed JSON THEN the resolution SHALL
   yield no command AND SHALL emit **exactly one** `console.error` whose message contains that
   file's full path.
7. **HWC-07** — WHEN `postCreateCommands` is absent, `null`, a string, a number, or an array THEN
   the resolution SHALL yield no command and SHALL NOT throw.
8. **HWC-08** — WHEN `postCreateCommands[<repoName>]` is absent, `null`, a non-string, `''`, or
   whitespace-only THEN the resolution SHALL yield no command; WHEN it is a string with surrounding
   whitespace THEN the **trimmed** string SHALL be the executed command.
9. **HWC-09** — WHEN no key equals `basename(repoPath)` exactly BUT exactly one key equals it
   case-insensitively THEN that key's command SHALL be used; WHEN two or more keys match
   case-insensitively and none matches exactly THEN NO command SHALL be executed AND exactly one
   `console.error` SHALL be emitted naming the ambiguous repo.
10. **HWC-10** — WHEN `<workspace>\.app\config.json` contains `postCreateCommands` alongside
    `branchTemplate`/`worktreeTemplate` THEN `workspaceTemplates` SHALL return exactly
    `{ branchTemplate, worktreeTemplate }` with no leaked key, AND the command resolver SHALL
    ignore both template keys (WPC-21 parity, now within one file).
11. **HWC-11** — WHEN `repoPath` carries a trailing path separator (`M:\src\Code\`) THEN the
    workspace and repo name SHALL resolve identically to the separator-free form.
12. **HWC-12** — WHEN `repoPath` is degenerate for this derivation — a drive root (`M:\`), `''`, or
    any value whose `basename` is empty — THEN the resolution SHALL yield no command and SHALL NOT
    throw.
13. **HWC-13** — WHEN `repoPath` is not a direct child of a registered workspace (e.g. an arbitrary
    path passed by a workflow author) THEN its lexical parent SHALL be read anyway and, absent a
    matching key there, NO command SHALL be executed — no registry lookup, no error.
14. **HWC-14** — WHEN either config file is edited on disk THEN the next create SHALL observe the
    new value with no app restart (read-on-use; neither level is cached).

**Independent Test**: In a temp workspace holding a temp repo, (a) declare only
`postCreateCommands: { "<repoName>": "cmdW" }` at workspace level and assert the create runs `cmdW`;
(b) add `postCreateCommand: "cmdR"` inside the repo and assert it runs `cmdR` **once** and `cmdW`
never; (c) remove both and assert the result has no `hook` key and no command ran.

---

## Edge Cases

Covered by HWC-05..HWC-13 above (unreadable/malformed file, wrong-typed `postCreateCommands`,
wrong-typed / blank / whitespace value, case-mismatched and ambiguous keys, trailing separator,
drive-root and empty `repoPath`, repo outside any registered workspace).

---

## Implicit-Requirement Dimensions Sweep

Medium scope — dimensions obviously present for this domain are covered; the rest collapse to N/A.

| Dimension                        | Resolution                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Input validation & bounds        | HWC-07, HWC-08 (shape + blankness), HWC-09 (key matching), HWC-11, HWC-12 (path degeneracy). Output/time bounds unchanged from WPC-05/11.    |
| Failure / partial-failure states | HWC-05, HWC-06 — a bad workspace file degrades to "no command", never to a throw or a broken create. Hook-execution failure paths unchanged (WPC-03..05: worktree always kept). |
| Observability                    | HWC-06 (malformed file logged once, path named), HWC-09 (ambiguous key logged once)                                                          |
| State-transition integrity       | HWC-01 — exactly one command per create; the run-iff-created rule is untouched (WPC-08)                                                      |
| Idempotency / retry              | HWC-14 — read-on-use, no cache; at most one command per successful create, no automatic retry (unchanged)                                    |
| Concurrency / ordering           | Inherited WPC-22: resolution is a pure per-call file read holding no state, so concurrent creates cannot interfere                           |
| Remaining dimensions             | N/A for this scope — no auth boundary, no network dependency and no persisted data are introduced; this feature only changes where one string is read from |

---

## Requirement Traceability

**Status after execution:** all 14 ACs are **Verified** — T1–T3 plus the T4 docs commit, checked
by a standalone fresh-eyes pass (9/12 mutants killed, 3 accepted equivalence survivors; see
`validation.md`). **All four Success Criteria are now met** — the last one, a real worktree create
from the New Worktree dialog against `M:\Triade\source\Code`, was run end-to-end on 2026-08-04 and
is recorded in `validation.md`. Note the validation was **not** performed by an independent Verifier
sub-agent — the harness is configured without them — so author ≠ verifier is unmet and the sensor is
the compensating control.

| Requirement ID | Story                          | Phase | Status  |
| -------------- | ------------------------------ | ----- | ------- |
| HWC-01         | P1: Declared outside the repo  | Done  | Verified |
| HWC-02         | P1: Declared outside the repo  | Done  | Verified |
| HWC-03         | P1: Declared outside the repo  | Done  | Verified |
| HWC-04         | P1: Declared outside the repo  | Done  | Verified |
| HWC-05         | P1: Declared outside the repo  | Done  | Verified |
| HWC-06         | P1: Declared outside the repo  | Done  | Verified |
| HWC-07         | P1: Declared outside the repo  | Done  | Verified |
| HWC-08         | P1: Declared outside the repo  | Done  | Verified |
| HWC-09         | P1: Declared outside the repo  | Done  | Verified |
| HWC-10         | P1: Declared outside the repo  | Done  | Verified |
| HWC-11         | P1: Declared outside the repo  | Done  | Verified |
| HWC-12         | P1: Declared outside the repo  | Done  | Verified |
| HWC-13         | P1: Declared outside the repo  | Done  | Verified |
| HWC-14         | P1: Declared outside the repo  | Done  | Verified |

**ID format:** `HWC-[NUMBER]` (Hook Workspace Config)

**Coverage:** 14 total, all in the P1 MVP slice. No P2/P3 slice — the feature is one resolution rule.

**Unit-testable vs hand-verified** (per `.specs/codebase/TESTING.md`): all 14 are main-process
logic reachable by unit tests over real temp directories plus the existing injected-fake shell —
**no renderer surface and no new real-process or real-git test**, so L-005's timeout hazard does
not apply here. HWC-03's "no signature change" is structural and is proven by the diff plus the
existing `worktree-manager` / `post-create-hook` suites staying green unmodified.

---

## Success Criteria

- [x] `M:\Triade\source\Code\.app\config.json` is **deleted** — `git status` in that repo is clean
      again — and `M:\Triade\source\.app\config.json` declares
      `postCreateCommands: { "Code": ".\\SetupSkills.cmd < NUL" }`.
- [x] Creating a worktree for `M:\Triade\source\Code` from the New Worktree dialog leaves
      `.claude\skills` and `.codex\skills` junctions in the new worktree, with the command coming
      from the workspace file. **Discharged 2026-08-04** — see the end-to-end run recorded in
      `validation.md`.
- [x] A repo with neither config file behaves byte-identically to today (the existing
      `worktree-manager`, `post-create-hook` and `repo-config` suites pass unmodified).
- [x] `README.md` documents both declaration sites and the repo-wins precedence.
