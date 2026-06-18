# Feature: Refresh Base Branch on Worktree Create

**Milestone:** Post-v2 Enhancement
**Size:** Medium (one new tested seam in `WorktreeManager`; checkbox + one new optional IPC field threaded through the two existing create dialogs — no new architecture, no new config field)
**Sources:** PRD #1 (`WorktreeManager`, start-work flow); builds on `create-worktree` + `start-work-from-task` features. Reuses the `git` execFile seam and the dialog chassis.

## Why

Today both worktree-creation paths run `git worktree add <target> -b <new> <base>` off the **local** base ref, which is whatever the dev last had on disk — frequently behind `origin`. The new branch is therefore born stale, and the dev only discovers it after the first push/PR shows surprise diffs or a needless merge-base. Refreshing the base from its remote **before** the worktree is cut makes every new branch start from the current remote tip, removing a silent, recurring source of rework. It stays opt-out for the offline / deliberately-stale case.

## Decisions (from discussion)

- **WBR-D1 — Truly update the local base, fast-forward only.** The refresh fast-forwards the *local* base branch to its remote upstream (not merely basing the new branch off `origin/<base>`). Fast-forward only — never merge or rebase.
- **WBR-D2 — Block on any refresh failure; never create from a stale base silently.** Offline, auth failure, no configured upstream, a dirty base checkout, or a non-fast-forward (diverged) base all abort the create with a readable error. The dev fixes it or unticks the box.
- **WBR-D3 — Default on, per-dialog, not persisted.** The checkbox starts checked every time a dialog opens. No `AppConfig` field, no Settings entry — opting out is per-creation.
- **WBR-D4 — Refresh only applies to the new-branch-from-base path.** When the dialog's base field is empty (the "check out an existing branch" path, no `-b`), there is no base to refresh and the option is inert.

## Requirements

### WBR-01 — Fast-forward the local base from its upstream before create
When the option is on **and** a base branch is supplied, before `git worktree add`:
1. Resolve the base branch's configured upstream (`git rev-parse --abbrev-ref <base>@{upstream}` → e.g. `origin/main`), splitting it into remote + remote-branch.
2. `git fetch <remote> <base>` to update the remote-tracking ref.
3. Fast-forward the **local** `<base>` ref to the fetched upstream tip:
   - If `<base>` is **checked out** in some worktree (the normal case — `main` in the primary checkout), run `git merge --ff-only <remote>/<base>` **in that worktree**.
   - If `<base>` is **not checked out** anywhere, fast-forward the ref directly (`git fetch <remote> <base>:<base>`, which is fast-forward-only by default).
4. Then `git worktree add <target> -b <new> <base>` off the now-current local base.

### WBR-02 — Block, don't degrade, on any refresh failure
If any step of WBR-01 fails, the worktree is **not** created and `createWorktree` returns `{ ok: false, error }` with a readable, first-line git/explanatory message. Distinct, recognizable cases:
- **No upstream configured** for the base branch → e.g. `Base branch "main" has no remote upstream to refresh from. Uncheck "update base" to skip.`
- **Fetch failed** (offline / auth) → the git failure's first line.
- **Diverged** (local base has commits not on remote → non-fast-forward) → e.g. `Local "main" has diverged from origin/main — can't fast-forward. Uncheck "update base" to skip.`
- **Dirty base checkout** blocking the ff merge → the git failure's first line (merge --ff-only aborts).
The existing failure paths (empty template name, target exists, plain `git worktree add` failure) are unchanged.

### WBR-03 — Refresh is gated and side-effect-free when off
- With the option **off**, `createWorktree` behaves exactly as today (no fetch, no merge) — byte-for-byte the current code path.
- With the option **on but no base branch** (empty base field), the refresh is skipped (WBR-D4); the existing "check out existing branch" path runs unchanged.

### WBR-04 — Checkbox in both create dialogs, default checked
`NewWorktreeDialog` and `StartWorkDialog` each gain a single checkbox — label e.g. **"Update base branch from remote"** — checked by default on open, threaded into the `worktrees:create` call as `updateBase`.
- The checkbox is visually de-emphasized when the base field is empty (the refresh would be inert per WBR-D4) — disabled or with a "no base branch" note. (Minor; renderer-only, hand-verified.)
- Creation errors from WBR-02 render inline in the existing `dialog-error` slot and keep the dialog open for correction (same as every other create error today).

### WBR-05 — IPC contract carries the opt-in
`worktrees:create` request gains `updateBase?: boolean` (optional; absent = off, preserving any other caller). `index.ts` threads it into `createWorktree`.

## Out of scope

- **No persisted preference / Settings entry** (WBR-D3). No `AppConfig` change.
- **No merge/rebase of a diverged base** — fast-forward only; divergence blocks (WBR-D2).
- **No interactive credential handling.** Fetch relies on already-cached git credentials; a credential prompt is suppressed (`GIT_TERMINAL_PROMPT=0`) and treated as a fetch failure → block. (Documented limitation; GUI helper popups are outside our control.)
- **No update of the base when checking out an existing branch** (empty base field, WBR-D4).
- **No new toast/notification channel** — errors ride the dialog's existing inline error.

## Verification

**Unit (real git in temp dirs — `worktree-manager.test.ts`, pattern 2):** set up a bare "remote" + a clone with an upstream-tracking base, then assert the refresh seam:
- ff path: remote advances → create with `updateBase` fast-forwards local base and the new branch contains the remote commit.
- not-checked-out base: ff updates the ref without a worktree.
- diverged base (local commit not on remote) → `{ ok: false }`, worktree not created, no partial state.
- no upstream configured → `{ ok: false }` with the no-upstream message.
- dirty base checkout blocking ff → `{ ok: false }`.
- `updateBase` off → no fetch/merge; identical to today (and offline does not matter).
- `updateBase` on but empty base → existing-branch checkout path, no refresh.

**Hand-verify (CDP smoke / visual):** the checkbox renders checked by default in both dialogs; unticking reproduces today's behavior; a behind-base repo yields an up-to-date new branch; a refresh failure shows the inline error and leaves no worktree.

## Traceability

| Req | Code |
| --- | --- |
| WBR-01, WBR-02, WBR-03 | `src/main/worktree-manager.ts` (refresh seam + `createWorktree`) |
| WBR-05 | `src/shared/ipc-contract.ts`, `src/main/index.ts` |
| WBR-04 | `src/renderer/src/components/NewWorktreeDialog.tsx`, `StartWorkDialog.tsx` (+ `NewWorktreeDialog.css`) |
| Unit | `src/main/worktree-manager.test.ts` |
