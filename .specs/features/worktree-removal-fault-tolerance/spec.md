# Worktree Removal Fault Tolerance Specification

**Milestone:** Post-v2 hardening (extends M2 _Delete Worktree (guarded)_ and _Force-Remove Worktree_)
**Sources of truth:** this conversation (user report + 4 owner decisions), measured probes against
git 2.49.0.windows.1 / Node 24.9.0 (§Verified behavior below), `delete-worktree/spec.md` (DLWT-01..04),
`force-remove-worktree/spec.md` (FRWT-01..04), `worktree-manager.ts` (`removeWorktree`), `repo-scanner.ts`
(why an orphan is invisible), `session-manager.ts` (`stop` does not await exit), AD-013 (the post-create
hook that creates the skills junctions this feature must stop destroying)
**Scope size:** Large — full spec + requirement IDs; `design.md` + `tasks.md` to follow
**Lessons applied:** L-001 (confirmed) — the new `leftover` field crosses main→shared→renderer; wire
producer and consumer in one phase rather than relaxing it to optional to keep an interim typecheck green

## Problem Statement

`git worktree remove` is not atomic, and on Windows it fails open. When any process holds a file inside
the worktree, git deletes **part** of the tree, fails, and then deletes its bookkeeping **anyway** — its
own source comments this as _"continue on even if ret is non-zero, there's no going back from here."_
The worktree disappears from `git worktree list` while its files stay on disk. Because git also deletes
the worktree's `.git` file, the leftover folder has no `.git` at all, so `scanRepos` (`repo-scanner.ts:30-33`)
skips it and **the app cannot see it**: the user is shown "removal failed", the row vanishes on the next
refresh anyway, and a folder leaks silently — later blocking any attempt to recreate that same worktree
(`fatal: '<path>' already exists`). Retrying is impossible, because git now answers `fatal: '<path>' is not
a working tree`.

The same investigation surfaced a second, worse defect on the **success** path. AD-013's post-create hook
creates skills **junctions** inside worktrees. Git for Windows treats a junction as an ordinary directory,
so `git worktree remove --force` **recurses into it and deletes the shared target's contents** — and
reports success. Every hook-created worktree is dirty (`?? .skills/`), so today's UI routes exactly those
worktrees to the force path.

This feature inverts the order: **the app deletes the directory itself (junction-safe, with a bounded
retry), and only then asks git to drop the bookkeeping.** A deletion that cannot complete therefore leaves
the worktree fully registered — visible, retryable, self-healing — instead of an invisible orphan.

## Goals

- [ ] A worktree is **never** deregistered from git while its files are still on disk — the app's core
      removal invariant
- [ ] A removal blocked by a locked file reports **which path is blocking and how many entries remain**,
      keeps the row in the tree, and succeeds on a plain retry once the holder is gone
- [ ] Removal **never touches data outside the worktree** — junction/symlink targets survive intact,
      closing the AD-013 skills data-loss path
- [ ] Transient locks (a just-terminated agent still releasing handles) resolve **automatically** within a
      bounded retry, without the user clicking anything
- [ ] Terminating a worktree's agent sessions actually **waits for the processes to exit** before deletion
      starts, instead of racing them
- [ ] Creating a worktree over a leftover folder offers a **clean-and-continue** path instead of git's raw
      `fatal: already exists` (P2)
- [ ] Guards are preserved end-to-end: primary checkout, `git worktree lock`, and the dirty/force rules all
      refuse **before** anything is deleted

## Out of Scope

| Feature | Reason |
| --- | --- |
| Identifying/naming the process holding the lock | Needs handle enumeration (Restart Manager / Sysinternals `handle64`); not installed, no Node binding. The error names the blocked *path* instead |
| Killing arbitrary (non-app) processes rooted in the worktree | Owner decision: terminate only sessions the app itself started. Killing a user's editor is not ours to do |
| Persisted pending-cleanup queue / auto-retry on app start | Unnecessary under delete-first: a failed removal leaves the worktree **registered**, so the existing row *is* the retry handle |
| Workspace-wide scan for abandoned worktree folders | Heuristic detection would false-positive on ordinary folders; owner chose the precise create-time collision path instead |
| Cleaning orphans already on disk, other than at create time (P2) | One-time manual cleanup; the app can no longer produce new ones after this feature |
| Deleting the branch with the worktree | Unchanged from DLWT/FRWT: removal is worktree-only |
| `git worktree prune` surface | Verified equivalent for bookkeeping, but repo-wide; the per-worktree `git worktree remove` is the narrower tool |
| Stopping junction-bearing worktrees from reading as dirty | Real annoyance (`?? .skills/` forces every hook worktree down the force path), but it is a hook/ignore concern, not removal |
| Auto-stash / preserving discarded work | Unchanged stance from FRWT |

---

## Verified behavior (measured, not assumed)

All on this machine: **git 2.49.0.windows.1**, **Node 24.9.0**, Windows 11. Probe scripts under the
session scratchpad; each result below was observed, not inferred.

**A. The reported fault reproduces exactly.** External process holds `sub/deep.txt` with `FileShare.None`:

```
git worktree remove --force <wt>   → exit 255
error: failed to delete '<wt>': Invalid argument
  files left on disk : sub/, sub/deep.txt, untracked.txt   (partial deletion)
  .git file          : deleted by git
  .git/worktrees/<id>: DELETED ANYWAY  → gone from `git worktree list`
  retry              : fatal: '<wt>' is not a working tree   ← git can no longer help
  branch             : survives
```

**B. The orphan is invisible and blocking.** No `.git` remains, so `scanRepos` skips it. Recreating that
worktree later: `git worktree add` → `fatal: '<path>' already exists` (a non-empty leftover). An **empty**
leftover directory is accepted by `git worktree add` (exit 0).

**C. Delete-first works and inverts the failure mode.**

```
fs.rm(wt, {recursive:true, force:true})  → ok
git worktree remove <wt>   (dir already gone)  → exit 0, bookkeeping cleaned, no longer listed
partial fs.rm failure (locked file)      → worktree STILL registered + listed; admin dir intact;
                                            retry after the holder exits → exit 0, fully clean
```

**D. Junction data loss is real, and app-side deletion fixes it.** Identical fixture, shared folder
junctioned into the worktree as `.skills`:

```
git status --porcelain of the worktree      → "?? .skills/"      (⇒ dirty ⇒ UI routes to force)
git worktree remove --force → reports SUCCESS, shared target: nested/, nested/deep.txt, precious.txt → (EMPTY)
fs.rm  recursive/force      → shared target: nested/, nested/deep.txt, precious.txt  (fully intact)
```

**E. `fs.rm` is safe on the content that worried us.** Read-only (`0444` + `attrib +R`) files: deleted.
A nested real git repo with its read-only object store: deleted. Node's own open file handles do **not**
block deletion (libuv sets `FILE_SHARE_DELETE`) — so a test fixture needs a genuine external holder.

**F. Node's built-in retry ladder is unusable; a self-managed loop is not.** Directory locked by a child
process whose cwd is inside it (the real agent-terminal case), time to fail:

| Attempt policy | Result | Wall time |
| --- | --- | --- |
| `maxRetries: 0` | EBUSY | **2 ms** |
| `maxRetries: 1, retryDelay: 100` | EBUSY | 326 ms |
| `maxRetries: 2, retryDelay: 100` | EBUSY | 1 239 ms |
| `maxRetries: 5, retryDelay: 200` | EBUSY | **21 599 ms** ⚠️ |
| own loop: 4 × (`maxRetries: 0`) spaced 250 ms | EBUSY | **786 ms** |
| own loop, holder exits at 600 ms | **OK** | 796 ms |
| happy path, 200 files, no lock | OK | 121 ms |

Node retries at every level of the recursive walk, so its cost compounds. The policy must therefore be
`maxRetries: 0` per attempt inside our own deadline-bounded loop.

**G. `git worktree lock` must be checked before deleting.** A locked worktree shows a `locked <reason>`
line in `git worktree list --porcelain`, and git refuses removal even with a single `--force`
(`use 'remove -f -f' to override or unlock first`). Under delete-first, nothing else would enforce it.

---

## Decisions (gray areas resolved during Specify)

- **Delete-first ordering** _(owner-selected)_: `removeWorktree` deletes the worktree tree itself, then
  calls `git worktree remove` purely to drop bookkeeping. Chosen over "recover after git's failure" and
  "snapshot/restore the admin dir" because it is the only option that also closes the junction data-loss
  path (finding D), and because its failure mode is the benign one — git never runs, so the worktree stays
  registered (finding C).
- **Auto-retry, then an inline error naming the leftovers** _(owner-selected)_: a bounded retry absorbs the
  common transient lock; on exhaustion the Danger section names the blocked path and the remaining entry
  count. **No new persistence** — the still-registered worktree is itself the retry handle.
- **Terminate known sessions, wait for real exit, then retry** _(owner-selected)_: today `SessionManager.stop`
  kills the PTY and finalizes synchronously (`session-manager.ts:118-123`), and `sessions:stop` resolves
  immediately, so the renderer starts deleting while children may still hold handles (candidate lesson
  L-003: killing a shell does not kill its children). The wait plus the retry loop is what makes it reliable.
  Arbitrary process hunting stays out of scope.
- **Create-time leftover collision handled as P2** _(owner-selected)_: a create whose target exists,
  is non-empty, and is not a registered worktree offers clean-and-continue rather than surfacing
  `fatal: already exists`. A workspace-wide orphan scan was rejected as too heuristic.
- **Bookkeeping cleaner = `git worktree remove <path>`** (agent default): verified exit 0 once the directory
  is gone (finding C). Preferred over `git worktree prune`, which is repo-wide and could clear unrelated
  stale entries.
- **`force` keeps its FRWT meaning — "skip the dirty check" only**: it no longer implies git's `--force`
  deletion, because the app performs the deletion. The primary/registered/locked guards apply under force.

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Removal strategy | Delete-first, git for bookkeeping | Owner-selected; measured findings C + D | y |
| Failure surface | Bounded auto-retry, then inline error naming leftovers; no persistence | Owner-selected | y |
| Lock handling | Terminate app-owned sessions, await exit, then retry | Owner-selected | y |
| Existing leftovers | Handled only at create time (P2) | Owner-selected | y |
| Retry interval / budget | 250 ms between attempts, 3000 ms total budget, `maxRetries: 0` per attempt | Derived from finding F: a failing attempt costs ~2 ms, so the budget is wall-clock honest, and a released lock self-heals in ~800 ms | n (agent default) |
| Session-exit wait | 3000 ms, then proceed anyway | A hung child must not block removal forever; the retry + leftover report covers the residue | n (agent default) |
| Paths > 260 chars | Rely on libuv's `\\?\` long-path handling; **not probed** | Node normalizes long Windows paths internally. If it fails, the leftover report surfaces it as a named failure rather than a silent orphan — the failure mode is safe either way | n (agent default) |
| Retryable error set | `EBUSY`, `EPERM`, `ENOTEMPTY`, `EACCES`; everything else reports immediately | The lock-type errors Windows raises for sharing violations (finding F yielded `EBUSY`); retrying e.g. `EINVAL` only wastes the budget | n (agent default) |
| Junction detection | Node's `fs.rm` native behavior (`lstat` reports junctions as symlinks → unlink, no recursion) | Finding D verified the target survives; no hand-rolled reparse-point handling needed | y (measured) |
| Removal remains a single IPC round-trip | No progress streaming for long deletions | A 200-file tree deletes in 121 ms; the bounded failure path reports in < 1 s | n (agent default) |

**Open questions:** none — all resolved or logged above.

---

## Implicit-requirement dimensions sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | WRFT-01 AC 2-4: the target must be a registered worktree of *this* repo, not the primary checkout, path-normalized — the app never recursively deletes an unvalidated path |
| Failure / partial-failure states | WRFT-02 (never deregister with files remaining; partial deletion stays registered) + WRFT-04 (leftover report) |
| Idempotency / retry / duplicate handling | WRFT-02 AC 2-4: retry after a partial failure self-heals; a second removal of an already-deleted directory still cleans bookkeeping and returns ok |
| Auth boundaries & rate limits | N/A because this is a single-user local desktop app with no auth surface and no remote callers |
| Concurrency / ordering | WRFT-05 (kill → observed exit → delete → deregister ordering) + Edge Cases (concurrent double-remove is idempotent; the in-flight button disable from DLWT-02 AC 5 is unchanged) |
| Data lifecycle / expiry | WRFT-03: data outside the worktree (junction targets) must survive removal. Leftovers have no TTL — they stay registered and user-driven, by decision |
| Observability | WRFT-04 AC 3 + WRFT-06 AC 1: the failure names the blocked path and the remaining count in the UI. Metrics/tracing N/A because the app has no logging infrastructure |
| External-dependency failure | WRFT-02 AC 3: git failing at the bookkeeping step is returned, never thrown, and self-heals on retry; the existing `gitFailureLine` discipline is unchanged |
| State-transition integrity | WRFT-02 AC 1 is the invariant: `registered+present → registered+absent → unregistered`; the app never reaches `unregistered+present` |

---

## User Stories

### P1: Delete-then-deregister with pre-flight guards ⭐ MVP

**User Story**: As a developer, I want the app to delete the worktree folder itself before telling git to
forget it, so that a blocked deletion never leaves an invisible folder behind.

**Acceptance Criteria**:

1. WHEN `removeWorktree(repoPath, worktreePath)` is called on a clean, non-primary, unlocked, registered
   worktree THEN the app SHALL delete the worktree directory itself **first**, then run
   `git worktree remove <worktreePath>` for bookkeeping, and return `{ ok: true }` — with the folder gone
   from disk **and** the entry gone from `git worktree list --porcelain`
2. WHEN `worktreePath` is not present as a `worktree` entry of `repoPath` in `git worktree list --porcelain`
   THEN remove SHALL refuse with a message stating it is not a registered worktree of this repo, and SHALL
   delete nothing from disk
3. WHEN the entry carries a `locked` line THEN remove SHALL refuse with a message including git's lock
   reason, and SHALL delete nothing — including under `force: true`
4. WHEN `worktreePath` equals `repoPath` (primary checkout) THEN remove SHALL refuse with the unchanged
   DLWT-01 message before any deletion, including under `force: true`
5. WHEN the worktree is dirty and `force` is absent/false THEN remove SHALL refuse with the unchanged
   `"N uncommitted change(s) — commit or stash before removing."` message before any deletion
6. WHEN `force: true` THEN only the dirty pre-check SHALL be skipped; AC 2, 3 and 4 SHALL still refuse

**Independent Test**: Vitest on real temp git repos — clean remove leaves neither folder nor listing entry;
an unregistered path refuses with the folder untouched; a `git worktree lock`ed worktree refuses (with the
reason) under both plain and `force` calls; primary refuses under force; dirty refuses without force.

---

### P1: A worktree is never deregistered while its files remain ⭐ MVP

**User Story**: As a developer, I want a failed deletion to leave the worktree fully registered, so that the
row stays visible and I can simply retry instead of hunting an invisible folder.

**Acceptance Criteria**:

1. WHEN the directory deletion does not complete THEN `git worktree remove` SHALL NOT be invoked at all, the
   worktree SHALL still appear in `git worktree list --porcelain`, and the result SHALL be `{ ok: false }`
2. WHEN a removal that failed on a lock is retried after the holding process has ended THEN the retry SHALL
   complete both steps and return `{ ok: true }`
3. WHEN the directory deletion succeeds but `git worktree remove` fails THEN the result SHALL be
   `{ ok: false }` carrying git's first stderr line, and a subsequent retry SHALL return `{ ok: true }`
   (git accepts removing a registered worktree whose directory is already gone — finding C)
4. WHEN the worktree directory is already absent (deleted outside the app) THEN the deletion step SHALL be a
   no-op and the bookkeeping step SHALL still run, returning `{ ok: true }`

**Independent Test**: Vitest — hold a lock inside a real temp worktree, call remove, assert `ok: false` **and**
that `git worktree list --porcelain` still contains the path; release the holder, call remove again, assert
`ok: true` and both the folder and the entry are gone.

---

### P1: Removal never destroys data outside the worktree ⭐ MVP

**User Story**: As a developer whose worktrees contain skills junctions (AD-013), I want removal to unlink
those junctions rather than delete through them, so that removing a worktree never empties my shared folder.

**Acceptance Criteria**:

1. WHEN the worktree contains a directory junction or symlink THEN removal SHALL unlink it without recursing
   into it, and every file under the junction's target SHALL still exist afterwards with unchanged content
2. WHEN removal completes for such a worktree THEN the result SHALL be `{ ok: true }` and the worktree folder
   (including the junction entry itself) SHALL be gone
3. WHEN the junction target is unreachable or already deleted THEN removal SHALL still succeed (a dangling
   junction is unlinked like any other entry)

**Independent Test**: Vitest on a real temp repo — junction a fixture folder containing `nested/deep.txt` and
`precious.txt` into the worktree, remove the worktree, assert both files still exist. This test fails against
today's implementation (finding D measured the target emptied), which is the point.

---

### P1: Bounded retry with an actionable leftover report ⭐ MVP

**User Story**: As a developer, I want a transient lock to resolve itself and a stubborn one to tell me
exactly what is blocking, so that I never have to guess why a removal failed.

**Acceptance Criteria**:

1. WHEN a deletion attempt fails with `EBUSY`, `EPERM`, `ENOTEMPTY` or `EACCES` THEN the app SHALL retry the
   deletion every **250 ms** until a total budget of **3000 ms** is exhausted, each attempt using
   `maxRetries: 0` so Node's own compounding retry ladder is never engaged (finding F: it costs 21 599 ms)
2. WHEN the lock is released within the budget THEN removal SHALL proceed to the bookkeeping step and return
   `{ ok: true }`
3. WHEN the budget is exhausted THEN the result SHALL be `{ ok: false }` with a `leftover` payload carrying
   `blockedPath` (the path of the entry that could not be deleted) and `remaining` (the **recursive** count
   of every entry still present anywhere under the worktree root, not just its top level), and the `error`
   message SHALL name `blockedPath`, state the remaining count, and say the worktree is still registered and
   the removal can be retried. The `leftover` payload SHALL be present on the returned result itself — the
   renderer branches on it (`WorktreeDetail.tsx`), so it is part of the contract, not an internal detail.
   Guard refusals (primary / unregistered / locked / dirty) carry **no** `leftover`, since nothing was deleted
4. WHEN a deletion attempt fails with any other error code THEN the app SHALL report it immediately in the
   same shape without consuming the retry budget
5. WHEN removal fails for any reason THEN it SHALL return within **5000 ms** of the call

**Independent Test**: Vitest — with a fake deleter that fails N times then succeeds, assert the call succeeds
and that attempts were spaced by the interval; with a permanently failing fake, assert `ok: false`, the
`leftover` payload, and that the elapsed time respects the budget. One real-lock test (external holder
process) proves the fake matches reality.

---

### P1: Terminated sessions are really gone before deletion starts ⭐ MVP

**User Story**: As a developer removing a worktree with running agents, I want the app to wait for those
processes to actually exit before it deletes files, so that its own terminals stop being the thing that
blocks the removal.

**Acceptance Criteria**:

1. WHEN removal is confirmed for a worktree with running sessions THEN each session's PTY SHALL be observed
   exited (its real exit event) before the directory deletion begins, or a **3000 ms** wait SHALL elapse first
2. WHEN a session's process does not exit within that wait THEN removal SHALL proceed anyway rather than
   blocking indefinitely — the retry loop and leftover report cover the residue
3. WHEN a stopped session's handles are released shortly after its exit THEN the WRFT-04 retry loop SHALL
   absorb the delay and the removal SHALL succeed without further user action
4. WHEN a session stop fails THEN the existing behavior SHALL be unchanged: removal is aborted and the error
   surfaces inline (`WorktreeDetail.tsx:173-179`)

**Independent Test**: Vitest against `SessionManager` with a fake PTY port whose exit is delayed — assert the
stop resolves only after the port's exit event fires, and that it resolves anyway once the wait elapses for a
port that never exits.

---

### P1: The failure is visible in the UI and the row stays ⭐ MVP

**User Story**: As a developer, I want a failed removal to leave the worktree in the sidebar with a clear
reason, so that "removal failed" and what I see actually agree.

**Acceptance Criteria**:

1. WHEN removal fails THEN the Danger section SHALL show the error including the blocked path and the
   remaining entry count, and the worktree SHALL still be listed after a tree refresh (today it disappears)
2. WHEN the user ends the blocking process and clicks Remove again THEN the removal SHALL succeed, the row
   SHALL disappear and the `"Removed <branch>"` toast SHALL show
3. WHEN removal fails THEN the Remove button SHALL return to its enabled state (no permanent busy) so the
   retry needs no app restart
4. WHEN the blocked path is long THEN it SHALL wrap or scroll within the Danger section without pushing the
   layout (mirror the existing inline-error treatment)

**Independent Test**: CDP smoke (`scripts/smoke-remove.mjs` extension) — hold a lock inside a seeded
worktree, click Remove, assert the inline error names the path and the row is still present after a refresh;
release the holder, click Remove, assert the row disappears with the toast.

---

### P2: Create over a leftover folder offers clean-and-continue

**User Story**: As a developer recreating a worktree whose folder was orphaned by an earlier failure (or a
manual `git worktree remove`), I want the app to offer to clear it, so that I am not blocked by a raw git error.

**Acceptance Criteria**:

1. WHEN a create targets a path that exists, is non-empty, is not a registered worktree of any repo, and does
   not contain a `.git` directory THEN the create SHALL return `conflict: 'path-exists'` with the entry count,
   **upgrading the app's own existing flat refusal** — `createWorktree` already guards the target at
   `worktree-manager.ts:87-89` with `Target path already exists: <target>`, so git's
   `fatal: '<path>' already exists` is never actually reached and this AC replaces a dead-end app message,
   not a raw git error *(wording corrected during T8: the original AC named the git error)*
2. WHEN the user confirms cleanup THEN the app SHALL delete the leftover using the same junction-safe bounded
   deleter and then proceed with the create; the resulting worktree SHALL be created normally (post-create
   hook included, per AD-013)
3. WHEN that cleanup deletion fails THEN the create SHALL abort with the WRFT-04 leftover report and no
   worktree SHALL be created
4. WHEN the target path contains a `.git` directory or is a registered worktree THEN cleanup SHALL NOT be
   offered and the create SHALL refuse with a message saying the path holds a repository or worktree
5. WHEN the target path exists but is empty THEN the create SHALL proceed unchanged (git accepts an empty
   directory — finding B)

**Independent Test**: Vitest on real temp repos — create onto a non-empty junk folder returns
`conflict: 'path-exists'` with the count and creates nothing; the confirmed path clears it and creates the
worktree; a folder containing a `.git` directory refuses without offering cleanup.

---

## Edge Cases

- WHEN two removals of the same worktree run concurrently THEN the second SHALL find the directory already
  gone, clean bookkeeping (or find it already clean) and return `{ ok: true }` — never a hard error
- WHEN the worktree contains read-only files or a nested repository with a `0444` object store THEN deletion
  SHALL still succeed (finding E)
- WHEN the worktree path contains spaces or non-ASCII characters THEN removal SHALL handle it (`execFile`,
  no shell — unchanged discipline)
- WHEN the worktree is in detached-HEAD state THEN removal SHALL behave as for any non-primary worktree
- WHEN a path inside the worktree exceeds 260 characters and deletion fails THEN it SHALL surface as a named
  leftover failure (never a silent orphan) — see Assumptions
- WHEN the repo itself is gone or git is unavailable THEN the registered-worktree pre-check SHALL fail closed:
  refuse and delete nothing
- WHEN the dirty pre-check itself fails to run (unreadable worktree) THEN the existing `statusOf` stance
  (report clean) is unchanged — the registered/primary/locked guards still apply

---

## Requirement Traceability

| Requirement ID | Story | Phase (tasks) | Status |
| --- | --- | --- | --- |
| WRFT-01 | P1: Delete-then-deregister with pre-flight guards | Phase 2 (T3, T4) | ⚙ Implemented — pending Verifier |
| WRFT-02 | P1: Never deregister while files remain | Phase 1–2 (T1, T4) | ⚙ Implemented — pending Verifier |
| WRFT-03 | P1: No data destroyed outside the worktree (junctions) | Phase 1 (T1, T2) | ⚙ Implemented — pending Verifier |
| WRFT-04 | P1: Bounded retry + actionable leftover report | Phase 1–2 (T1, T2, T4, T5) | ⚙ Implemented — pending Verifier |
| WRFT-05 | P1: Sessions really exited before deletion starts | Phase 2 (T6) | ⚙ Implemented — pending Verifier |
| WRFT-06 | P1: Failure visible in the UI, row stays, retry works | Phase 2–3 (T5, T7) | ⚙ Implemented — pending Verifier **and** the owner's live smoke + visual pass |
| WRFT-07 | P2: Create over a leftover folder offers clean-and-continue | Deferred — follow-up PR (T9–T11) | ⏸ Deferred by owner decision (AD-014) |

**Status legend:** `⚙ Implemented — pending Verifier` means the code and its unit tests are committed and the
full gate is green, but the independent Verifier (author ≠ verifier) has **not** run yet — nothing here is
claimed Verified. `⏸ Deferred` means specified but deliberately not built on this branch.

**WRFT-07 pointer:** deferred to a follow-up PR at the owner's decision during Tasks approval, and recorded
in **AD-014**. Its tasks stay written verbatim as T9–T11 in `tasks.md` so the follow-up can lift them; they
build on the seams this branch creates (`removeDirTree`, and the `createWorktree` target guard at
`worktree-manager.ts:87-89` that `classifyTargetPath` replaces).

**Coverage target:** 7 requirements. WRFT-01..05 and WRFT-07's backend half are unit-testable
(`worktree-manager.test.ts`, `session-manager.test.ts`); WRFT-06 and WRFT-07's dialog follow the project's
renderer convention (hand-verified + CDP smoke). WRFT-06's smoke (`scripts/smoke-remove.mjs`) is **written
but not yet run** — a CDP smoke needs a live desktop session and is hand-run by the owner, never automated.

---

## Testing Notes

- **Real-lock fixture**: Node's own handles do not block deletion (finding E), so the honest fixture is an
  **external holder** — a child process whose cwd is inside the worktree (`spawn(process.execPath, ['-e',
  'setTimeout(...)'], { cwd: <inside wt> })`), which is also the real-world agent-terminal case. Measured
  cost ≈ 400 ms spawn settle + ~800 ms failing loop.
- **Keep the slow path rare**: use a DI'd fake deleter for the retry-policy assertions (fast, deterministic)
  and **one** real-lock test to prove the fake matches reality. Candidate lesson L-005 warns that
  `worktree-manager.test.ts` already sits near the default per-test timeout — give the real-lock and
  real-junction tests explicit generous timeouts rather than inheriting the default.
- **Assert literals, not constants** (candidate lesson L-004): pin `250`, `3000` and `5000` as literal
  expectations so a mutation of the constants is caught.
- **L-001 (confirmed)**: `RemoveWorktreeResult.leftover` crosses `shared/worktrees.ts` → main → renderer.
  Wire producer and consumer in the same phase; do not relax the field to keep an interim typecheck green.
- **Regression protection**: the existing DLWT/FRWT tests must stay green unchanged — the guard messages and
  result shape are deliberately preserved. Anchor the expected-pass count to the current baseline (533 tests
  / 39 files) with no deletions.
- **Junction test** must assert the *target's* contents, not just that the worktree is gone — asserting only
  the worktree would pass against today's data-destroying implementation.
- Gate: `npm run typecheck && npm run lint && npm test`; `node scripts/smoke-remove.mjs` on a live session.

## Success Criteria

- [ ] With a process holding a file in a worktree: Remove reports the blocked path inline, the row is still
      there after a refresh, and `git worktree list` still contains the worktree — no invisible folder exists
- [ ] Ending that process and clicking Remove again completes the removal (folder gone, row gone, toast)
- [ ] Removing a worktree that contains a skills junction leaves the shared source folder byte-identical
- [ ] A worktree whose agent sessions were just terminated removes on the first click, with no manual retry
- [ ] `git worktree lock`ed and primary worktrees still refuse, and refuse without deleting anything
- [ ] Creating a worktree over a leftover folder offers cleanup and then succeeds (P2)
- [ ] Full gate green with the existing DLWT/FRWT tests unchanged
