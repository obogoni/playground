# Force-Remove Worktree — Tasks

Baseline before this feature: confirm with `npm test` (record N). Every expected-pass count below is `N + added`.

Legend: `[P]` = parallelizable with siblings (unit-only, no shared file). Order otherwise sequential by `Depends on`.

---

## T1 — Shared types + IPC contract (FRWT-01)

**What:** Add the `ChangeStatus` union + `ChangedFile` interface to `src/shared/worktrees.ts`. Extend `'worktrees:remove'.req` with `force?: boolean` and add `'worktrees:changes': { req: { worktreePath: string }; res: ChangedFile[] }` to `src/shared/ipc-contract.ts` (import `ChangedFile`).
**Where:** `src/shared/worktrees.ts`, `src/shared/ipc-contract.ts`
**Depends on:** —
**Reuses:** existing `CreateWorktreeResult`/`RemoveWorktreeResult` export style in `worktrees.ts`; the channel-map shape in `ipc-contract.ts`.
**Done when:** types exist and are exported; `npm run typecheck` is green (no consumers yet).
**Tests:** none (type-only).
**Gate:** `npm run typecheck`

## T2 — Backend change reader + parser (FRWT-01) [P after T1]

**What:** In `src/main/worktree-manager.ts` add a pure `parseChangedFiles(stdout: string): ChangedFile[]` (porcelain → label per spec precedence: deleted > added > renamed > modified, `??` → untracked; rename uses the post-`->` destination; strip git's quoting on special-char paths) and `changedFilesOf(worktreePath): Promise<ChangedFile[]>` (runs `git status --porcelain`, parses, swallows errors → `[]`, mirroring `statusOf`). Do **not** touch `removeWorktree` — `{ force }` already works.
**Where:** `src/main/worktree-manager.ts`
**Depends on:** T1 (imports `ChangedFile`, `ChangeStatus`)
**Reuses:** `git()` helper, `statusOf` structure/error-swallow stance.
**Done when:** both functions exported; typecheck green.
**Tests (unit, T6 covers):** parser label mapping + rename destination + count parity with `statusOf`.
**Gate:** `npm run typecheck`

## T3 — Main IPC wiring (FRWT-01)

**What:** In `src/main/index.ts`: pass `force` through the remove handler — `handle('worktrees:remove', ({ repoPath, worktreePath, force }) => removeWorktree(repoPath, worktreePath, { force }))`; remove the stale `// No force path from the UI in v1` comment. Add `handle('worktrees:changes', ({ worktreePath }) => changedFilesOf(worktreePath))`. Import `changedFilesOf`.
**Where:** `src/main/index.ts`
**Depends on:** T1, T2
**Reuses:** existing `handle(...)` wiring pattern (e.g. `worktrees:create`).
**Done when:** both handlers wired; typecheck green.
**Tests:** none (thin IPC shell — hand-verified per TESTING.md).
**Gate:** `npm run typecheck`

## T4 — Confirm dialog: changes section + adaptive copy (FRWT-03)

**What:** Extend `RemoveWorktreeConfirm.tsx` with optional props `changes: ChangedFile[]` and `loadingChanges: boolean`. Render a changes section (one row per file: status pill/icon + path + label) when `changes.length > 0`, scrollable like `rwc-list`. Make title/body/confirm-label adapt to which guards apply: agents-only → "Terminate & remove"; changes-only → "Discard & remove"; both → "Terminate, discard & remove". Remove the stale "A worktree with uncommitted changes still can't be removed." note. Add minimal CSS to `RemoveWorktreeConfirm.css` for the changes rows + status pills (reuse existing tokens/`--red`/`--amber`).
**Where:** `src/renderer/src/components/RemoveWorktreeConfirm.tsx`, `RemoveWorktreeConfirm.css`
**Depends on:** T1
**Reuses:** existing `rwc-*` classes, `dialog-btn-danger`, `Icon`, the sessions-list layout as the template for the changes list.
**Done when:** component renders all four prop combinations correctly; typecheck + lint green.
**Tests:** none (renderer — smoke + visual per convention).
**Gate:** `npm run typecheck && npm run lint`

## T5 — WorktreeDetail: arm dirty button, fetch changes, force on confirm (FRWT-02, FRWT-03)

**What:** In `WorktreeDetail.tsx`: widen `removable` to `!worktree.isDefault` (dirty no longer blocks; primary still does). Flip the dirty `guardNote` to "N uncommitted change(s) will be discarded on remove" (primary note unchanged). `remove()` opens the confirm dialog when **dirty OR running agents** (else fast-path `doRemove()`); on open, fetch `worktrees:changes` into state (`changes`, `loadingChanges`). `doRemove()`/`confirmRemove()` pass `force: worktree.dirty` to `worktrees:remove`. Pass `changes`/`loadingChanges` to `RemoveWorktreeConfirm`. Keep agent-stop-then-remove ordering and inline error handling.
**Where:** `src/renderer/src/components/WorktreeDetail.tsx`
**Depends on:** T1, T4 (and T3 for the live IPC to exist at runtime)
**Reuses:** existing `confirmOpen`/`removing`/`removeError` state machine; `api.invoke`.
**Done when:** dirty button armed + opens dialog with fetched changes; confirm force-removes; primary still disabled-look; typecheck + lint green.
**Tests:** none (renderer — smoke + visual).
**Gate:** `npm run typecheck && npm run lint`

## T6 — Unit tests for parser + force-remove (FRWT-01) [P]

**What:** Extend `src/main/worktree-manager.test.ts` (real temp git repos): (a) `parseChangedFiles` maps M/A/D/R/?? to the right labels, rename surfaces the destination path, count matches `statusOf().changes`; (b) `removeWorktree({ force: true })` removes a dirty worktree (modified + untracked + deleted present) — folder vanishes, listing shrinks; (c) primary still refuses under `{ force: true }`.
**Where:** `src/main/worktree-manager.test.ts`
**Depends on:** T2
**Reuses:** `mkdtempSync`/`realpathSync.native` fixture + `git()` helper already in the file.
**Done when:** new cases green; total = baseline + added, zero deletions.
**Tests:** themselves.
**Gate:** `npm test`

## T7 — Extend smoke + full gate (FRWT-03, FRWT-04)

**What:** Extend `scripts/smoke-remove.mjs`: seed a sibling worktree with mixed dirt (modify a tracked file, add an untracked file, delete a tracked file), open Remove, assert the dialog lists each file with the correct status label, confirm, assert the row disappears + toast shows the branch + primary selected. Run the full gate.
**Where:** `scripts/smoke-remove.mjs`
**Depends on:** T3, T5, T6
**Reuses:** existing CDP scaffolding + assertions in `smoke-remove.mjs`.
**Done when:** `npm run typecheck && npm run lint && npm test` green; smoke passes on a live session (hand-run).
**Tests:** the smoke itself (manual) + full unit gate.
**Gate:** `npm run typecheck && npm run lint && npm test` then `node scripts/smoke-remove.mjs` (live)

---

## Dependency graph

```
T1 ─┬─ T2 ─┬─ T3 ─────────────┐
    │      └─ T6 [P] ─────────┤
    ├─ T4 ──────── T5 ────────┴─ T7
```

T1 first. Then T2/T4 in parallel. T6 after T2 `[P]`. T3 after T2. T5 after T4 (+T3 at runtime). T7 last (full gate + smoke).

## Commit plan (atomic, per task)

- `feat(worktrees): ChangedFile type + force in remove IPC contract` (T1)
- `feat(worktrees): parse changed files + changedFilesOf reader` (T2)
- `feat(worktrees): wire force-remove + worktrees:changes IPC` (T3)
- `feat(worktrees): list discarded changes in remove confirm dialog` (T4)
- `feat(worktrees): arm dirty Remove button, force on confirm` (T5)
- `test(worktrees): parseChangedFiles + force-remove on temp repos` (T6)
- `test(worktrees): smoke force-remove with change preview` (T7)

PR body must include `Closes #<issue>` once the feature issue is synced via `tlc-to-issues`.
