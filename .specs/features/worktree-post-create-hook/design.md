# Worktree Post-Create Hook — Design

**Spec**: `spec.md` (WPC-01..24) · **Scope**: Medium · **Baseline**: 489 tests / 36 files (main, green)

---

## The one real decision: where the hook attaches

WPC-10 requires all three create paths to run the hook. They all funnel through
`createWorktree()` (`src/main/worktree-manager.ts:72`), which already takes **6 positional
params** and is covered by ~40 real-git tests. Four ways to get a hook in:

| Option                                                             | Verdict                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — 7th positional param `hook?: HookRunner` on `createWorktree` | ❌ A 7th positional is unreadable, and it widens `CtxDeps.worktree.create` + the `workflow-ctx` pass-through, so `workflow-ctx.ts` and its tests change for nothing.                          |
| **B** — module-level `setHookRunner()` setter                        | ❌ Global mutable state. Vitest runs files in parallel workers; a shared runner is exactly the shared-mutable-state the project's testing conventions avoid.                                  |
| **C** — trailing options object `opts?: { runHook }`                 | ⚠️ Cleaner than A but still forces the hook concern *into* the real-git module and its 40 tests, and still widens the `CtxDeps` signature.                                                    |
| **D** — **decorator wrapper `withPostCreateHook(create, deps)`** ✅  | Same signature in, same signature out → drop-in for both consumers. `worktree-manager.ts` and its 40 real-git tests are **untouched**. `workflow-ctx.ts` is **untouched**. Hook decision logic is unit-testable against a *fake* create — no git, no spawn, fast. |

**Chosen: D.** One wiring point in `index.ts` serves all three paths:

```
index.ts
  const createWorktreeWithHook = withPostCreateHook(createWorktree, {
    readCommand: repoPostCreateCommand,
    runShell: runHookShell            // real spawn seam, hand-verified
  })

  handle('worktrees:create', … createWorktreeWithHook(…))     ← New Worktree + Start Work
  ctxDeps.worktree.create = createWorktreeWithHook            ← workflow ctx.worktree.create
```

Because both consumers are assigned the wrapper, **no caller can opt out** — WPC-10 holds
structurally rather than by convention. Per lesson **L-001**, the wrapper and both its
consumers are wired in the *same* task (T4), never split across phases.

---

## Modules

| Module                                       | New/Mod  | Responsibility                                                                                                          | Tests            |
| -------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `src/shared/worktrees.ts`                    | modify   | `PostCreateHookResult` + optional `hook?` on `CreateWorktreeResult`. Additive — absent key = today's shape (WPC-06).      | via T2           |
| `src/main/repo-config.ts`                    | **new**  | `repoPostCreateCommand(repoPath)` → `string \| null`. Reads `<repo>\.app\config.json`. Mirrors `workspace-config.ts`.     | unit (temp dir)  |
| `src/main/post-create-hook.ts`               | **new**  | `runPostCreateHook()` — env, output tail, exit-code → result mapping. `withPostCreateHook()` — the run-iff-created decorator. | unit (fakes)     |
| `src/main/index.ts`                          | modify   | `runHookShell` real spawn (shell + timeout + kill) and the single wiring point above.                                     | none (thin shell) |
| `src/renderer/…/HookFailureNotice.tsx` + css | **new**  | Presentational failure panel: created-path note, command, exit code / timeout, output tail.                               | none (convention) |
| `NewWorktreeDialog.tsx`, `StartWorkDialog.tsx` | modify | Hold `hook` failure state, render the notice, offer the proceed action.                                                    | none (convention) |

`workspace-config.ts`, `worktree-manager.ts`, `workflow-ctx.ts` — **not touched.**

---

## Contracts

```ts
// src/shared/worktrees.ts
export interface PostCreateHookResult {
  ok: boolean            // exit code === 0
  command: string        // the command as declared
  code: number           // exit code; -1 for spawn failure or timeout kill
  output: string         // combined stdout+stderr, last 4000 chars, '' when silent (WPC-23)
  timedOut?: boolean     // set only on the timeout path (WPC-05)
}
// CreateWorktreeResult gains:  hook?: PostCreateHookResult

// src/main/post-create-hook.ts
export interface HookShellResult { code: number; stdout: string; stderr: string; timedOut?: boolean }
export type HookShell = (cmd: string, opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }) => Promise<HookShellResult>
```

**Decision rule (`withPostCreateHook`)** — the hook runs **iff** the inner create reports a
worktree, i.e. `result.ok === true && typeof result.path === 'string'`. Every no-worktree
outcome in WPC-08 fails that test without needing to be enumerated: `conflict:'branch-exists'`
is `ok:false`, and so are the empty-template, target-exists, base-refresh and git-failure
paths. The successful `reuse`/`recreate` paths are `ok:true` with a `path`, so they run the
hook — as WPC-08 requires.

**Timeout split (honest boundary):** `runPostCreateHook` unit-tests the *mapping* of a
`timedOut` shell result to `hook: { ok:false, code:-1, timedOut:true }` (WPC-05's observable
contract). The actual process kill lives in `runHookShell` via `spawn`'s native `timeout`
option — a thin OS shell, hand-verified per `TESTING.md`, like `runShell` before it.

---

## Sequence

```
createWorktreeWithHook(repo, branch, …)
  │
  ├─ createWorktree(...)                         ← unchanged, all existing guards
  │    └─ ok:false | conflict ──────────────────→ return as-is, NO hook key      (WPC-06/08)
  │
  ├─ ok:true + path
  │    ├─ repoPostCreateCommand(repoPath)
  │    │    └─ null (absent/blank/malformed) ───→ return as-is, NO hook key      (WPC-06/07)
  │    └─ command
  │         └─ runPostCreateHook(cmd, {worktreePath, repoPath, branch})
  │              └─ runHookShell(cmd, {cwd: worktreePath, env: +PLAYGROUND_*, timeoutMs: 120000})
  │
  └─ return { ...result, hook }                  ← ok stays true even on hook failure (WPC-03)
```

---

## Renderer flow

Both dialogs already own `error` / `conflict` / `busy` state and a footer region. Add one
`hookFailure` state:

```
result.ok && result.path
  ├─ result.hook?.ok === false → setHookFailure({path, hook})   → notice stays open, create button disabled (WPC-16)
  └─ otherwise                 → today's path exactly            (close, refresh tree, select)  (WPC-15)
```

The notice's action calls the same `onCreated(path)` the happy path calls, so dismissing
proceeds with tree refresh + selection rather than unwinding (WPC-14).

---

## Constants

| Constant                | Value    | AC     |
| ----------------------- | -------- | ------ |
| `HOOK_TIMEOUT_MS`       | `120000` | WPC-05 |
| `HOOK_OUTPUT_MAX_CHARS` | `4000`   | WPC-11 |
| config file             | `<repo>\.app\config.json`, key `postCreateCommand` | WPC-01 |
| env vars                | `PLAYGROUND_WORKTREE_PATH`, `PLAYGROUND_REPO_PATH`, `PLAYGROUND_BRANCH` | WPC-09 |
