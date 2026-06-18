# Tasks: Refresh Base Branch on Worktree Create

Test baseline: confirm with `npm test` before starting (STATE last logged 183).
Gate per task: `npm run typecheck && npm run lint && npm test` (+ `electron-vite build` once at the end).

## WBR-T1 — IPC contract: `updateBase?` on `worktrees:create`
- **What:** Add `updateBase?: boolean` to the `worktrees:create` req in `src/shared/ipc-contract.ts`.
- **Depends on:** —
- **Done when:** typecheck passes; field optional (absent = off).
- **Tests:** none (type-only).

## WBR-T2 — Refresh seam in `WorktreeManager` (core)
- **What:** In `src/main/worktree-manager.ts`, add a `refreshBaseFromRemote(repoPath, baseBranch)` helper returning `{ ok } | { ok:false, error }`: resolve `<base>@{upstream}`, `git fetch <remote> <base>`, then ff the local base — `merge --ff-only <remote>/<base>` inside the worktree that has `<base>` checked out (locate via `worktree list --porcelain`), else `git fetch <remote> <base>:<base>`. Suppress credential prompts (`GIT_TERMINAL_PROMPT=0`). Extend `createWorktree` to accept `updateBase` and call the helper only when `updateBase && baseBranch`; on `{ ok:false }` return it (worktree not created). Distinct messages for no-upstream / diverged per WBR-02.
- **Depends on:** —
- **Done when:** WBR-01/02/03 behavior implemented; off-path byte-identical to today.
- **Tests:** see WBR-T3.

## WBR-T3 — Unit tests for the refresh seam
- **What:** Add to `src/main/worktree-manager.test.ts` (pattern 2 — bare remote + clone in temp dirs): ff-updates-checked-out-base, ff-updates-not-checked-out base, diverged→block, no-upstream→block, dirty-base→block, `updateBase` off→no fetch (unchanged), `updateBase` on + empty base→existing-branch path.
- **Depends on:** WBR-T2.
- **Done when:** new tests green; full suite green.

## WBR-T4 — Thread `updateBase` through main
- **What:** `src/main/index.ts` `handle('worktrees:create', …)` passes `updateBase` into `createWorktree`.
- **Depends on:** WBR-T1, WBR-T2.
- **Done when:** typecheck + lint green.

## WBR-T5 — Checkbox in `NewWorktreeDialog`
- **What:** Add a default-checked "Update base branch from remote" checkbox; pass `updateBase` to the `worktrees:create` call; de-emphasize/disable when base field is empty (WBR-D4). Add minimal CSS to `NewWorktreeDialog.css` (shared by both dialogs).
- **Depends on:** WBR-T1.
- **Done when:** typecheck + lint green; checkbox checked by default.
- **Tests:** none (renderer — hand-verify).

## WBR-T6 — Checkbox in `StartWorkDialog`
- **What:** Same checkbox + `updateBase` wiring (reuses WBR-T5's CSS class).
- **Depends on:** WBR-T1, WBR-T5.
- **Done when:** typecheck + lint green.
- **Tests:** none (renderer — hand-verify).

## WBR-T7 — Final gate + build
- **What:** `npm run typecheck && npm run lint && npm test` then `electron-vite build`.
- **Depends on:** all above.
- **Done when:** all green.
