# Worktree Post-Create Hook Specification

## Problem Statement

A fresh `git worktree add` gives you a checkout, but not a *working* checkout. Repos
increasingly need a one-shot local initialization step after the files land —
`m:\triade\source\Code` ships `SetupSkills.cmd` (→ `SetupSkills.ps1`) whose only job is to
create the `.claude\skills` and `.codex\skills` junctions that let multiple coding agents
share one skills source. Today that script has to be remembered and double-clicked by hand
in every new worktree, and worktrees created by a **workflow** (for an agent to work in)
never get it at all — which is precisely the case that needs it most.

## Goals

- [ ] A repo can declare one shell command that runs automatically, with cwd = the new
      worktree, after every successful worktree create — from any of the app's three create
      paths.
- [ ] A failing init command never costs the user the worktree: the checkout is kept and the
      failure is reported with its exit code and output, not swallowed.
- [ ] Zero behavior change for repos that declare nothing.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                                       | Reason                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple commands / ordered hook list                         | One command is enough — a repo that needs several chains them in its own `.cmd`/`.ps1`, exactly as `SetupSkills.cmd` already calls `SetupSkills.ps1`.    |
| Other lifecycle hooks (pre-create, post-remove, post-checkout) | Only the post-create pain is real today. Adding a hook registry now would design for hooks nobody has asked for.                                         |
| Settings-dialog UI for the command                            | The command is repo-local and checked in (AD decision below); there is nothing per-machine to edit. A global override can be layered later if needed.     |
| Trust prompt / command allowlist                              | Deliberate: see the security assumption below. The set of repos in a registered workspace is already fully trusted by the app (it runs `git` in them).   |
| Process-tree kill on timeout                                  | The timeout kills the spawned shell; a detached grandchild may survive. A real tree-kill (`taskkill /T /F`) is a separate, Windows-specific concern.      |
| Streaming live output into a terminal session                  | Considered and rejected during Specify — needs session lifecycle plumbing and severs the create's knowledge of whether init succeeded.                    |
| Re-run / retry action for a failed hook                        | The command is idempotent by convention (the reference script is) and re-runnable by hand from the worktree. An in-app re-run button is a v2 nicety.      |
| Reading the hook command from the **new worktree's** copy      | The source repo's `.app/config.json` is authoritative — reading the worktree's own copy would let a branch under development change what runs on checkout. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here — nothing is left silently unclear.

| Assumption / decision                                                | Chosen default                                                                                                                       | Rationale                                                                                                                                                                                   | Confirmed? |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Where the command is declared                                        | New repo-local `<repoPath>\.app\config.json`, key `postCreateCommand`                                                                | Mirrors the existing `<workspace>\.app\config.json` reader (`workspace-config.ts`) one level down: read-on-use, no caching, malformed → silent fallback. The repo self-describes its own init and it travels with the repo. | **y**      |
| Failure semantics                                                    | Keep the worktree, return `ok: true` with a `hook` failure payload                                                                    | `git worktree add` already succeeded — the checkout is valid git. Destroying it (plus any base refresh / branch recut) over a fixable script error is the worse outcome.                     | **y**      |
| Which create paths run it                                            | All three — the hook lives inside `createWorktree()`                                                                                  | One seam, one behavior. Workflow-created worktrees are the case that most needs init (agents need the skills junctions).                                                                     | **y**      |
| Feedback surface                                                     | Inline in the dialog on failure; silent on success                                                                                    | No new noise on the happy path; the failure lands in the slot the create errors already use, next to an explicit "the worktree *was* created" note.                                          | **y**      |
| **Security: the command comes from repo content**                    | No confirmation prompt, no allowlist — it just runs                                                                                  | Owner accepted this trade-off when choosing the repo-local home. A registered workspace's repos are already trusted (the app runs `git` in them, and worktree paths are derived from them). Flagged here so it is a recorded decision, not an oversight: **cloning an untrusted repo into a registered workspace means its `postCreateCommand` runs on your next worktree create for that repo.** | **y**      |
| Hosting shell                                                        | `spawn(cmd, { shell: true, windowsHide: true, cwd: <worktree> })` — same shape as the existing `runShell` (`index.ts:70`)              | `.cmd` files require a shell. Reusing the proven `ctx.sh` runner shape means one spawn idiom in the codebase, and `{code, stdout, stderr}` capture that never throws.                        | y (agent)  |
| Timeout                                                              | Fixed **120000 ms**, not configurable                                                                                                | Long enough for a junction/copy/restore script, short enough that a hung hook doesn't wedge the create forever. A knob can be added when a real script needs one.                            | y (agent)  |
| Captured-output bound                                                | Combined stdout+stderr, **last 4000 characters** retained                                                                            | An unbounded string from a chatty script would be held in the main process and shipped over IPC to the dialog. The tail is what diagnoses a failure.                                        | y (agent)  |
| Context handed to the command                                        | Inherited `process.env` plus `PLAYGROUND_WORKTREE_PATH`, `PLAYGROUND_REPO_PATH`, `PLAYGROUND_BRANCH`                                  | The reference script needs none of these (it resolves from `$PSScriptRoot`), but a generic script needs the branch/source-repo without re-deriving them. Cheap and additive.                 | y (agent)  |
| Workflow run-timeline detail box                                     | **P2**, not MVP                                                                                                                      | It needs a new `StepDetail` variant *and* a `RunDetail` render branch. The hook result is already reachable by a workflow author via the returned `CreateWorktreeResult.hook` without it.     | y (agent)  |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Repo-declared init command runs after create ⭐ MVP

**User Story**: As a developer, I want a command my repo declares to run automatically in
each new worktree, so that a fresh worktree is immediately usable (skills junctions in
place) without me remembering to double-click a script.

**Why P1**: This is the entire feature. Without it there is nothing to report on and nothing
to render.

**Acceptance Criteria**:

1. **WPC-01** — WHEN `createWorktree` completes a `git worktree add` successfully AND
   `<repoPath>\.app\config.json` contains a non-blank string `postCreateCommand` THEN the
   system SHALL execute that command through a shell with `cwd` set to the created worktree
   path, before returning.
2. **WPC-02** — WHEN the command exits with code `0` THEN the result SHALL be
   `{ ok: true, path: <worktree>, hook: { ok: true, command: <cmd>, code: 0, output: <tail> } }`.
3. **WPC-03** — WHEN the command exits with a non-zero code `N` THEN the result SHALL be
   `{ ok: true, path: <worktree>, hook: { ok: false, command: <cmd>, code: N, output: <tail> } }`
   AND the worktree directory SHALL still exist on disk (no rollback, no `worktree remove`).
4. **WPC-04** — WHEN the command cannot be spawned at all (shell-level spawn error) THEN the
   result SHALL carry `hook: { ok: false, code: -1, … }` with the error text included in
   `output`, and the worktree SHALL still exist.
5. **WPC-05** — WHEN the command has not exited within **120000 ms** THEN the system SHALL
   terminate the spawned shell process and return
   `hook: { ok: false, code: -1, timedOut: true, output: <tail captured so far> }`, and the
   worktree SHALL still exist.
6. **WPC-06** — WHEN `<repoPath>\.app\config.json` is absent, unreadable, malformed JSON, or
   its `postCreateCommand` is missing / blank / whitespace-only / not a string THEN NO command
   SHALL be executed AND the returned result SHALL have **no `hook` property** (identical to
   the pre-feature result shape).
7. **WPC-07** — WHEN `<repoPath>\.app\config.json` is malformed JSON THEN the system SHALL log
   the ignored file via `console.error` and fall back silently (same stance as
   `workspaceTemplates`).
8. **WPC-08** — WHEN a create ends **without** a new worktree — `conflict: 'branch-exists'`,
   an empty rendered template name, a pre-existing target path, a blocked base refresh, a
   branch live in another worktree, or any failed `git worktree add` — THEN NO command SHALL
   be executed. WHEN a create **does** produce a worktree via the `onExisting: 'reuse'` or
   `onExisting: 'recreate'` paths THEN the command SHALL run exactly as on the normal path.
9. **WPC-09** — WHEN the command is executed THEN its environment SHALL be the inherited
   `process.env` plus `PLAYGROUND_WORKTREE_PATH` (created worktree path),
   `PLAYGROUND_REPO_PATH` (source repo path), and `PLAYGROUND_BRANCH` (the branch name).
10. **WPC-10** — WHEN a worktree is created through **any** of the three paths
    (`worktrees:create` IPC from New Worktree, the same IPC from Start Work, and workflow
    `ctx.worktree.create`) THEN the hook SHALL run, because it is executed inside
    `createWorktree` itself and no caller can opt out.
11. **WPC-11** — WHEN the command's captured combined output exceeds 4000 characters THEN
    `hook.output` SHALL contain the **last** 4000 characters.

**Independent Test**: In a temp repo with `.app\config.json` declaring a command that writes
a marker file, call `createWorktree` and assert (a) the marker exists inside the new worktree,
(b) `hook.ok === true`, `hook.code === 0`. Swap in a command that exits 1 and assert
`ok === true`, `hook.ok === false`, `hook.code === 1`, worktree still present.

---

### P1: Hook failure is visible where the user created the worktree ⭐ MVP

**User Story**: As a developer, I want a failed init command reported in the dialog I just
used, so that I know the worktree exists but is not fully set up — instead of discovering
missing junctions later.

**Why P1**: Per the failure decision the create returns `ok: true`; without this the failure
is silently discarded by both dialogs and the feature is undetectable in the UI.

**Acceptance Criteria**:

1. **WPC-12** — WHEN `worktrees:create` returns `hook.ok === false` from the **New Worktree**
   dialog THEN the dialog SHALL remain open and display: a confirmation that the worktree was
   created (with its path), the executed command, the exit code (or a timeout label), and the
   `hook.output` tail.
2. **WPC-13** — WHEN `worktrees:create` returns `hook.ok === false` from the **Start Work**
   dialog THEN the dialog SHALL remain open and display the same four elements as WPC-12.
3. **WPC-14** — WHEN a hook-failure state is shown THEN the dialog SHALL offer an action that
   dismisses it and proceeds with the normal post-create flow (tree refresh + select the new
   worktree) — the created worktree is never stranded behind an error the user must undo.
4. **WPC-15** — WHEN the result has `hook.ok === true` OR no `hook` property THEN both dialogs
   SHALL behave exactly as they do today (close, refresh the tree, select the new worktree)
   with no additional UI.
5. **WPC-16** — WHEN a hook-failure state is shown THEN the create button SHALL NOT re-submit
   the same create (the worktree already exists; a re-submit would fail on the target-path
   guard).

**Independent Test**: With a repo whose `postCreateCommand` is `exit /b 1`, create a worktree
from each dialog and confirm the failure panel shows command + exit code + output, the
worktree appears in the tree after dismissing, and no error is shown for a repo with no
`.app\config.json`.

---

### P2: Hook result on the workflow run timeline

**User Story**: As a workflow author, I want a worktree step's init result shown in the run
timeline, so that a failed init in an unattended run is visible without reading the
workflow's own logging.

**Why P2**: Needs a new shared `StepDetail` variant plus a `RunDetail` render branch. Until
then a workflow author can already read `result.hook` from `ctx.worktree.create` and
`ctx.log`/`ctx.notify` it — so the information is reachable, just not automatic.

**Acceptance Criteria**:

1. **WPC-17** — WHEN a `ctx.worktree.create` step's result carries a `hook` THEN the
   `step-finished` event SHALL carry a `detail` describing it (command, ok, code, output tail).
2. **WPC-18** — WHEN a `ctx.worktree.create` step's hook failed THEN the step SHALL still be
   reported `ok: true` (a hook failure is not a step failure — consistent with WPC-03).
3. **WPC-19** — WHEN a run's `worktree.create` step carries a hook detail THEN `RunDetail`
   SHALL render it in the step's detail box, visually marked as failed when `ok` is false.

---

## Edge Cases

- **WPC-20** — WHEN the created worktree path contains spaces THEN the command SHALL still run
  correctly (the path is passed as the spawn `cwd`, never interpolated into the command string).
- **WPC-21** — WHEN `<repoPath>\.app\config.json` contains `postCreateCommand` alongside
  `branchTemplate`/`worktreeTemplate` keys THEN each reader SHALL ignore the other's keys — the
  hook reader never affects template resolution and vice versa.
- **WPC-22** — WHEN two creates run concurrently (e.g. a workflow run plus a manual create)
  THEN each hook SHALL execute independently with its own cwd and captured output; neither
  shares state with nor blocks the other.
- **WPC-23** — WHEN the command produces no output at all THEN `hook.output` SHALL be the empty
  string (never `undefined`), so consumers need no absent-vs-empty branch.
- **WPC-24** — WHEN the command exits 0 but the worktree is still not properly initialized
  (script silently did nothing) THEN the system SHALL report success — the exit code is the only
  contract; the app does not verify the script's intent.

---

## Implicit-Requirement Dimensions Sweep

Medium scope — dimensions obviously present for this domain are covered; the rest are
explicitly N/A.

| Dimension                        | Resolution                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Input validation & bounds        | WPC-06 (blank / non-string / malformed), WPC-05 (time bound), WPC-11 (output bound)                     |
| Failure / partial-failure states | WPC-03, WPC-04, WPC-05 — every failure mode keeps the worktree and reports; WPC-08 defines "no worktree" |
| Observability                    | WPC-07 (`console.error` on malformed config), WPC-12/13 (surfaced to the user), WPC-17 (run timeline)   |
| Concurrency / ordering           | WPC-22 (independent), and the hook is strictly ordered after `git worktree add`, before the return      |
| State-transition integrity       | WPC-08 — hook runs **iff** a worktree was actually created                                              |
| Idempotency / retry              | No automatic retry; the hook runs at most once per successful create. Re-running is manual (Out of Scope) |
| Auth boundaries & rate limits    | N/A because the command runs in-process on the user's own machine at their own request; no remote caller |
| External-dependency failure      | N/A because the hook makes no network or service call — the spawned process is the only dependency, covered by WPC-04/05 |
| Data lifecycle / expiry          | N/A because the hook persists nothing — the captured output lives only in the returned result           |

---

## Requirement Traceability

| Requirement ID | Story                          | Phase | Status  |
| -------------- | ------------------------------ | ----- | ------- |
| WPC-01         | P1: Init command runs          | Tasks | Pending |
| WPC-02         | P1: Init command runs          | Tasks | Pending |
| WPC-03         | P1: Init command runs          | Tasks | Pending |
| WPC-04         | P1: Init command runs          | Tasks | Pending |
| WPC-05         | P1: Init command runs          | Tasks | Pending |
| WPC-06         | P1: Init command runs          | Tasks | Pending |
| WPC-07         | P1: Init command runs          | Tasks | Pending |
| WPC-08         | P1: Init command runs          | Tasks | Pending |
| WPC-09         | P1: Init command runs          | Tasks | Pending |
| WPC-10         | P1: Init command runs          | Tasks | Pending |
| WPC-11         | P1: Init command runs          | Tasks | Pending |
| WPC-12         | P1: Hook failure is visible    | Tasks | Pending |
| WPC-13         | P1: Hook failure is visible    | Tasks | Pending |
| WPC-14         | P1: Hook failure is visible    | Tasks | Pending |
| WPC-15         | P1: Hook failure is visible    | Tasks | Pending |
| WPC-16         | P1: Hook failure is visible    | Tasks | Pending |
| WPC-17         | P2: Run-timeline detail        | -     | Pending |
| WPC-18         | P2: Run-timeline detail        | -     | Pending |
| WPC-19         | P2: Run-timeline detail        | -     | Pending |
| WPC-20         | Edge case                      | Tasks | Pending |
| WPC-21         | Edge case                      | Tasks | Pending |
| WPC-22         | Edge case                      | Tasks | Pending |
| WPC-23         | Edge case                      | Tasks | Pending |
| WPC-24         | Edge case                      | Tasks | Pending |

**ID format:** `WPC-[NUMBER]`

**Coverage:** 24 total — 21 in the P1 MVP slice (WPC-01..16, WPC-20..24), 3 deferred to P2
(WPC-17..19).

**Unit-testable vs hand-verified** (per `.specs/codebase/TESTING.md`): WPC-01..11 and
WPC-20..24 are main-process logic → **unit tests** (real-temp-dir + injected-fake runner, no
real spawn in the assertions of the decision logic). WPC-12..16 and WPC-19 are renderer →
**hand-verified** by convention. The actual `spawn(shell:true)` seam in `index.ts` is a thin
OS shell → hand-verified.

---

## Success Criteria

- [ ] Creating a worktree for `m:\triade\source\Code` (with `.app\config.json` declaring
      `SetupSkills.cmd`) leaves `.claude\skills` and `.codex\skills` junctions present in the
      new worktree, with no manual step.
- [ ] A worktree created by a **workflow** for that repo gets the same junctions.
- [ ] A repo with no `.app\config.json` behaves byte-identically to today (existing
      `worktree-manager` tests pass unchanged).
- [ ] A deliberately-failing command yields a worktree that exists, plus a dialog showing the
      command, its exit code, and its output.
