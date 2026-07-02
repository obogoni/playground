# Feature: Reuse or Recreate an Existing Branch on Worktree Create

**Milestone:** Post-v2 Enhancement
**Size:** Medium (one new tested seam in `WorktreeManager` — pre-flight detection + two new create modes; one new optional IPC field + a discriminated result variant; one shared inline-choice component threaded into the two existing create dialogs — no new architecture, no new config field)
**Sources:** Builds on `create-worktree`, `start-work-from-task`, and `worktree-base-refresh`. Reuses the `git` execFile seam, the `worktreeHosting` helper, and the dialog chassis. Design resolved in a grill-me session (2026-07-02).

## Why

Today both worktree-creation paths run `git worktree add <target> -b <new> <base>` off the base ref. When a **local branch of that name already exists**, git aborts with `fatal: a branch named '<new>' already exists` and the create fails outright — the dev's only recourse is to close the dialog, rename or delete the branch by hand, and start over. Two intents are common and both are legitimate: **reuse** the branch I already have (pick up where I left off) or **throw it away and recut** from a fresh base. Detecting the collision up front and offering those two choices inline turns a dead-end error into a one-click decision, without ever silently destroying local work.

## Decisions (from grill-me)

- **EXB-D1 — Pre-flight detection, not error-parsing.** Detect the existing branch with `git rev-parse --verify refs/heads/<branch>` **before** running `worktree add`. Deterministic; no dependence on git's localized error string.
- **EXB-D2 — Only the new-branch-from-base path.** The collision only arises when a base is supplied (`-b`). The empty-base path already checks out an existing branch and is unchanged.
- **EXB-D3 — Reuse = check out as-is.** Reuse runs `git worktree add <target> <branch>` on the existing branch at its current tip; **base branch and `updateBase` are ignored** on this path (they only matter when cutting a new branch). Reuse never touches the branch's history.
- **EXB-D4 — Recreate = force-delete then recut.** Recreate runs `git branch -D <branch>` then the normal `-b <branch> <base>` (honoring `updateBase`). `-D` (force) is used directly — the user consciously chose "delete"; it does not stall on unmerged commits.
- **EXB-D5 — Branch checked out elsewhere blocks both choices.** If the existing branch is currently checked out in another worktree (`worktreeHosting` returns a path), neither reuse nor recreate can run cleanly (git refuses both). Return a distinct, immediate error instead of offering a choice that would fail.
- **EXB-D6 — Handshake, one round-trip on the happy path.** No `onExisting` mode + collision → `createWorktree` returns a `conflict` discriminator **without creating anything**. The renderer prompts, then re-invokes `worktrees:create` with the chosen `onExisting`, which executes that path without re-prompting.
- **EXB-D7 — Reuse is the safe default; recreate warns generically.** In the inline choice, **Reuse** is the primary/focused action (Enter never destroys). **Delete & recreate** is the dangerous secondary, carrying a generic warning ("discards this branch's local history") — no commit-count computation.
- **EXB-D8 — Recreate refreshes the base before deleting.** On the recreate path with `updateBase`, the base refresh runs first; if it fails the create is blocked and the branch is left intact — a preliminary-step failure must never destroy the branch it was about to replace.

## Requirements

### EXB-01 — Pre-flight detection of the existing branch
When a base branch is supplied and `onExisting` is absent, before `git worktree add`, `createWorktree` checks whether a local branch named `<branch>` exists (`git rev-parse --verify --quiet refs/heads/<branch>`). If it does **not** exist, creation proceeds exactly as today. If it **does** exist, no worktree/branch is created and `createWorktree` returns a conflict result (EXB-05). The existing pre-checks run first and are unchanged: empty template name and target-path-already-exists (EXB-D2 — those still short-circuit before the branch check).

### EXB-02 — Reuse checks out the existing branch as-is
When called with `onExisting: 'reuse'`, `createWorktree` runs `git worktree add <target> <branch>` (no `-b`, no base). The base branch and `updateBase` are ignored — no fetch, no fast-forward, no history change. On success returns `{ ok: true, path }`; on git failure returns `{ ok: false, error }` (git's first-line message).

### EXB-03 — Recreate deletes the branch and recuts from base
When called with `onExisting: 'recreate'`, `createWorktree` runs, **in this order**:
1. Base refresh when `updateBase` is on (WBR-01). A refresh failure blocks the create per WBR-02 **before the branch is touched** — the existing branch is preserved, never destroyed by a failure of a preliminary step (EXB-D8).
2. `git branch -D <branch>` (force-delete the existing branch). A delete failure returns the git failure line; no worktree is created.
3. `git worktree add <target> -b <branch> <base>` off the (now-refreshed) base.
On success the new branch points at base's tip and the old branch's unique commits are gone.

### EXB-04 — Branch checked out elsewhere blocks the choice
During pre-flight (EXB-01), if the existing branch is currently checked out in another worktree (`worktreeHosting(repoPath, branch)` returns a path), `createWorktree` returns `{ ok: false, error }` with a readable message naming the hosting worktree (e.g. `Branch "<branch>" is already checked out at <path>.`) — **not** a conflict result. Neither reuse nor recreate is offered, because git would refuse both. This check also applies when `onExisting` is supplied (a stale re-invoke): reuse/recreate against a checked-out branch returns the same error rather than a raw git failure.

### EXB-05 — IPC contract carries the mode and the conflict signal
`worktrees:create` request gains `onExisting?: 'reuse' | 'recreate'` (optional; absent = detect-and-signal). `CreateWorktreeResult` gains a discriminator for the collision case — `conflict?: 'branch-exists'` — set alongside `ok: false` (and no `error`), so the renderer distinguishes "branch exists, please choose" from an ordinary failure. `index.ts` threads `onExisting` into `createWorktree`.

### EXB-06 — Inline choice UI in both create dialogs
`NewWorktreeDialog` and `StartWorkDialog` both handle a `conflict: 'branch-exists'` response by rendering a shared presentational component (e.g. `<BranchExistsChoice>`) inline, in place of the error/footer area, showing:
- A message that the branch already exists.
- **Reuse existing branch** — primary, focused action → re-invokes create with `onExisting: 'reuse'`.
- **Delete & recreate** — dangerous secondary, with a generic destructive note → re-invokes create with `onExisting: 'recreate'`.
- **Cancel** — returns to the form (clears the conflict state).
Ordinary errors (including EXB-04's checked-out-elsewhere) still render in the existing inline `dialog-error` slot and keep the dialog open. The busy state disables the choice buttons during the re-invoke.

## Out of scope

- **No commit-count / ahead-behind in the warning** (EXB-D7) — a generic destructive note only; no extra `git rev-list`.
- **No safe-delete (`-d`) fallback or second confirmation** for recreate — `-D` direct (EXB-D4).
- **No rebase/fast-forward of the reused branch** onto the base (EXB-D3) — reuse is checkout-as-is.
- **No auto-removal of the other worktree** when the branch is checked out elsewhere (EXB-D5) — just a clear error.
- **No persisted preference** for reuse-vs-recreate — the choice is per-collision.
- **No change to the empty-base (existing-branch checkout) path** (EXB-D2).
- **No new toast/notification channel** — the choice and any errors ride the dialog inline.

## Verification

**Unit (real git in temp dirs — `worktree-manager.test.ts`, pattern 2):**
- No existing branch → create proceeds as today (unchanged happy path).
- Existing branch, no `onExisting`, not checked out elsewhere → returns `{ ok: false, conflict: 'branch-exists' }`, **no worktree and no branch mutation** (branch tip unchanged, no folder created).
- `onExisting: 'reuse'` → new worktree checks out the **existing** branch at its current tip; base/`updateBase` ignored (a stale base or advanced remote has no effect on the checked-out commit).
- `onExisting: 'recreate'` → branch is force-deleted and recut from base; the new branch points at base's tip, the old branch's unique commit is gone.
- `onExisting: 'recreate'` with `updateBase` on → base is refreshed first (WBR interaction), new branch contains the remote commit.
- Existing branch **checked out in another worktree** → `{ ok: false, error }` naming the hosting path, **no** `conflict`; same for a `reuse`/`recreate` re-invoke against it.
- Target-path-exists and empty-template guards still short-circuit before the branch check.

**Hand-verify (CDP smoke / visual):** creating with a colliding branch name shows the inline choice in both dialogs; Reuse is focused and Enter reuses (non-destructive); Delete & recreate shows the warning and recuts; Cancel returns to the form; the checked-out-elsewhere case shows the plain inline error.

## Traceability

| Req | Code |
| --- | --- |
| EXB-01, EXB-02, EXB-03, EXB-04 | `src/main/worktree-manager.ts` (pre-flight detection + reuse/recreate modes in `createWorktree`; reuses `worktreeHosting`) |
| EXB-05 | `src/shared/ipc-contract.ts`, `src/shared/worktrees.ts` (`CreateWorktreeResult.conflict`), `src/main/index.ts` |
| EXB-06 | `src/renderer/src/components/BranchExistsChoice.tsx` (new, shared), `NewWorktreeDialog.tsx`, `StartWorkDialog.tsx` (+ CSS) |
| Unit | `src/main/worktree-manager.test.ts` |
</content>
</invoke>
