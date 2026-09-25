# Status Bar Design

**Spec**: `.specs/features/status-bar/spec.md`
**Status**: Draft

---

## Architecture Overview

One new renderer surface (`StatusBar` + two popovers), one new main module (`git-sync.ts`) and one
extraction (`git.ts`). The bar reads what the app already knows — repo, branch and changed-file
count all come from the existing `tree:get` snapshot — and asks main only for what nothing else
computes: the sync state of the selected worktree, its commit lists, and the git operations.

```mermaid
graph TD
    App[App.tsx<br/>selectedId · selectedSessionId · tree · setToast] --> Bar[StatusBar]
    Bar --> Target[lib/status-bar.ts<br/>barTargetFor · splitBranch · fetchAge]
    Bar --> Hook[lib/use-git-sync.ts<br/>state per path · ops map]
    Bar --> SyncPop[SyncPopover]
    Bar --> ChgPop[ChangesPopover]
    Hook -->|git:sync-state<br/>git:commits<br/>git:run| Main[main/index.ts handlers]
    ChgPop -->|worktrees:changes| Main
    Main --> GitSync[main/git-sync.ts<br/>readSyncState · readCommits · runOp]
    GitSync --> Git[main/git.ts<br/>git\(\) · gitFailureLine\(\)]
    WM[main/worktree-manager.ts] --> Git
```

**Chosen approaches** (owner-confirmed, D1–D4):

| Axis | Choice | Rejected |
| ---- | ------ | -------- |
| D1 git invoker | Extract the private `git()` / `gitFailureLine()` out of `worktree-manager.ts` into `src/main/git.ts`, add an optional timeout | A private copy inside `git-sync.ts` (two definitions of how the app calls git — and the one that must not diverge is exactly the one carrying `GIT_TERMINAL_PROMPT=0` and no shell); growing `worktree-manager.ts` |
| D2 sync computation | On demand, for the selected worktree only, over a new `git:sync-state` channel | Folding upstream/ahead/behind into `tree:get` — 2 git calls × N worktrees on every focus refresh |
| D3 branch truncation | Two spans: a head span with `max-width:50%` + `text-overflow:ellipsis`, and a non-shrinking tail span; a pure function decides the split (as built: the cap sits on the branch element, 70% of the bar since 2026-09-19, and each span is half the name — see `splitBranch`) | Canvas measurement + `ResizeObserver`; a fixed character budget |
| D4 popovers | Reuse the `sidebar-ctx-menu` pattern — a positioned div dismissed by any click or Escape (`Sidebar.tsx:56-72,139`) | A new reusable `Popover` abstraction before a second consumer exists |

---

## Code Reuse Analysis

### Existing components to leverage

| Component | Location | How to use |
| --------- | -------- | ---------- |
| `git()` — `execFile`, no shell, `windowsHide`, `GIT_TERMINAL_PROMPT=0` | `src/main/worktree-manager.ts:522` | **Move** to `src/main/git.ts`, add optional `timeoutMs`; `worktree-manager.ts` imports it (import-only change, its ~40 real-git tests untouched) |
| `gitFailureLine()` — git's first stderr line | `src/main/worktree-manager.ts:365` | Move alongside `git()`; it is what STBR-14/18 render |
| `WorktreeNode.changes` — count of changed/untracked paths | `src/shared/tree.ts:21`, filled by `tree:get` | **The bar's file counter (STBR-29/31). No new call.** |
| `worktrees:changes` / `changedFilesOf` | `ipc-contract.ts:76`, `worktree-manager.ts:443` | The changes popover's list, on open only (STBR-30) |
| `ChangedFile` / `ChangeStatus` | `src/shared/worktrees.ts:126` | Row model for the popover — five statuses, not three (see Risks) |
| `sidebar-ctx-menu` floating-menu pattern | `src/renderer/src/components/Sidebar.tsx:56-72,139` | Both popovers: positioned div + dismiss on any click or Escape |
| `relativeTime(fromMs, nowMs)` | `src/renderer/src/lib/relative-time.ts:12` | Fetch age (STBR-22) — **needs a `days` tier and a `never` caller-side case** |
| `Toast` + `App`'s `setToast` | `Toast.tsx:11`, `App.tsx:70` | STBR-26's late outcome report |
| `findWorktree(tree, selectedId)`, `selectedId`, `selectedSessionId` | `App.tsx:283,105,113` | Everything the bar needs to know what to describe |
| `useTree().refreshTree` | `src/renderer/src/lib/use-tree.ts:59` | STBR-25's post-operation tree refresh |
| `handle()` typed IPC wrapper | `src/main/ipc.ts:18` | The three new channels |
| Hook-owned renderer state (AD-004) | `use-sessions.ts`, `use-tree.ts` | `use-git-sync.ts` follows the same shape instead of growing `App.tsx` |

### Integration points

| System | Integration |
| ------ | ----------- |
| `App.tsx` | Mounts `<StatusBar/>` after `</main>`; passes `tree`, `selectedId`, `selectedSessionId`, `sessions`, `direction`, `onToast`, `onRefreshTree`. No other App change |
| `tree:get` snapshot | Read-only consumer; no shape change |
| Existing git surface | `git-sync.ts` never calls `worktree-manager.ts`; both sit on `git.ts` |

---

## Components

### `src/main/git.ts` (new — extraction)

- **Purpose**: The single way this app runs git.
- **Interfaces**:
  - `git(cwd: string, args: string[], opts?: { timeoutMs?: number }): Promise<{ stdout: string }>` — `execFile`, `shell:false`, `windowsHide:true`, `GIT_TERMINAL_PROMPT=0`; `timeoutMs` maps to `execFile`'s `timeout`
  - `gitFailureLine(err: unknown): string`
  - `isTimeout(err: unknown): boolean` — `killed === true` / `signal === 'SIGTERM'`, so STBR-24 can be worded as a timeout rather than a generic failure
- **Dependencies**: `node:child_process`, `node:util`
- **Reuses**: the exact bodies moved from `worktree-manager.ts` (behaviour-preserving move)

### `src/main/git-sync.ts` (new)

- **Purpose**: Read a worktree's position against its upstream, and run the four operations.
- **Interfaces**:
  - `readSyncState(worktreePath: string): Promise<SyncState>` — `rev-parse --abbrev-ref HEAD` (detached → `rev-parse --short HEAD`), `rev-parse --abbrev-ref @{upstream}`, `rev-list --count --left-right @{upstream}...HEAD`, `remote`, and the newest `FETCH_HEAD` mtime under `resolve(worktreePath, <git-common-dir>)` and its `worktrees/*/`
  - `readCommits(worktreePath: string, limit = 20): Promise<CommitLists>` — `log --format=%h%x1f%s%x1f%ct <range>` for `@{upstream}..HEAD` and `HEAD..@{upstream}`, plus a `rev-list --count` for the "+N more" tail
  - `runGitOp(worktreePath: string, op: GitOp, remote?: string): Promise<GitOpResult>` — `sync` = `pull --ff-only --no-rebase` then `push` (`--no-rebase` so a `pull.rebase=true` config, which Git for Windows sets system-wide, cannot turn it into a rebase; added 2026-09-19 after the round-2 Verifier); `pull` / `push` / `fetch <remote> <branch>` / `publish` = `push -u <remote> <branch>`; every call carries `timeoutMs: 120_000`
  - `parseAheadBehind(stdout: string): { behind: number; ahead: number }` — **pure, unit-tested** (`--left-right` prints `behind<TAB>ahead` for `@{upstream}...HEAD`)
  - `parseCommitLines(stdout: string): CommitLine[]` — **pure, unit-tested**
- **Dependencies**: `git.ts`, `node:fs/promises` (`stat` for `FETCH_HEAD`), `node:path`
- **Concurrency**: a module-level `Map<worktreePath, Promise<GitOpResult>>`; a second `runGitOp` for a path already running resolves `{ ok:false, busy:true }` (STBR-28)
- **Failure posture**: never throws. Every failure returns a `SyncState.error` or a `GitOpResult.error` carrying `gitFailureLine(err)` (STBR-14/18)

### `src/shared/git.ts` (new)

Types shared by main, preload and renderer (below, under Data Models).

### IPC channels (added to `IpcContract`)

| Channel | Req | Res | ACs |
| ------- | --- | --- | --- |
| `git:sync-state` | `{ worktreePath }` | `SyncState` | 09, 11, 12, 13, 14, 22 |
| `git:commits` | `{ worktreePath }` | `CommitLists` | 15, 16 |
| `git:run` | `{ worktreePath, op, remote? }` | `GitOpResult` | 17–21, 23, 24, 26, 28 |

All three are request/response `invoke`/`handle` — no streaming. A long operation is one pending
promise, which is exactly what STBR-26 needs: it survives a selection change because the promise
belongs to the hook's op map, not to the rendered popover.

### `src/renderer/src/lib/status-bar.ts` (new — pure, unit-tested)

- `barTargetFor(input): BarTarget` — resolves what the bar describes from `{ direction, tree, selectedId, sessions, selectedSessionId }`: a worktree (STBR-02), the Agents session's worktree (STBR-03), a non-worktree folder (STBR-04), or nothing (STBR-05). A session's `cwd` belongs to the worktree it is inside: the root or any folder below it, compared case- and separator-insensitively on whole path segments, deepest worktree winning (corrected 2026-09-19: the exact match `session-attribution.ts` uses showed a session in `<worktree>/src` as a bare folder, against STBR-04).
- `splitBranch(branch: string): { head: string; tail: string }` — the name split in half, the head taking the odd character (STBR-06). Each half is at most half the branch element; the head is cut at its end with the ellipsis and the tail at its start, so a long name shows as much start as end (changed 2026-09-19 at the owner's request: the earlier last-segment tail left the head far wider than the tail).
- `fetchAgeLabel(lastFetchAt: number | null, nowMs: number): string` — `never` when null, otherwise `relativeTime` (STBR-22).
- `syncSectionFor(state: SyncState): SyncSection` — one discriminated union deciding what the section renders: `counts` / `no-upstream` / `detached` / `no-remote` / `error` (STBR-09, 12, 13, 14). **This is the seam that keeps the degraded modes honest**: one function, five outcomes, all testable.

### `src/renderer/src/lib/use-git-sync.ts` (new — hook, hand-verified per convention)

- Owns `state: SyncState | null` for the current target path, refetching when the target path changes and when the `tree` object identity changes (STBR-11).
- Owns `ops: Map<path, { op: GitOp; startedAt: number }>` so a running operation outlives the selection (STBR-26) and so buttons disable per path (STBR-23).
- On success: refetch `git:sync-state` and call `onRefreshTree()` (STBR-25). On completion with the popover closed: `onToast(...)` (STBR-26).

### `src/renderer/src/components/StatusBar.tsx` + `.css` (new)

- Left: repo name, then the two branch spans. Right: sync section, then the changes counter.
- Always mounted (STBR-01/05); `role="status"` on the region; the branch element carries the full name as `title` (STBR-07).
- Opens at most one popover at a time; Escape and any outside click close it (Edge cases).

### `src/renderer/src/components/SyncPopover.tsx` + `ChangesPopover.tsx` (new)

- `SyncPopover`: Sync / Pull / Push / Fetch (or Publish with a remote `<select>` when `remotes.length > 1`, STBR-19/20), the fetch-age line, the two commit lists with their `+N more` tail (STBR-16), a busy state (STBR-23) and an inline error line (STBR-18/24).
- `ChangesPopover`: one row per `ChangedFile` — status letter plus path, no per-file action (STBR-32); empty state text when the count is zero (STBR-31).

---

## Data Models

```typescript
// src/shared/git.ts
export interface SyncState {
  /** Branch name, or null while HEAD is detached. */
  branch: string | null
  /** Short sha when detached (STBR-08). */
  detachedSha?: string
  /** e.g. 'origin/main'; null when the branch has no upstream (STBR-12). */
  upstream: string | null
  /** Commits to pull / to push; both 0 when there is no upstream. */
  behind: number
  ahead: number
  /** Remote names, in git's order — drives Publish and its picker (STBR-13/19/20). */
  remotes: string[]
  /** FETCH_HEAD mtime in epoch ms; null when the repo never fetched (STBR-22). */
  lastFetchAt: number | null
  /** Git's first error line; set means the section degrades to it (STBR-14). */
  error?: string
}

export type GitOp = 'sync' | 'pull' | 'push' | 'fetch' | 'publish'

export interface CommitLine {
  sha: string
  subject: string
  /** Commit date, epoch ms. */
  at: number
}

export interface CommitLists {
  /** Commits in the upstream and not in HEAD. */
  incoming: CommitLine[]
  outgoing: CommitLine[]
  /** How many more exist beyond the 20 returned (STBR-16). */
  moreIncoming: number
  moreOutgoing: number
}

export interface GitOpResult {
  ok: boolean
  /** Git's first stderr line on failure. */
  error?: string
  /** The 120 s ceiling was hit and the process was killed (STBR-24). */
  timedOut?: boolean
  /** Another operation is already running for this worktree (STBR-28). */
  busy?: boolean
}
```

---

## Error Handling Strategy

| Scenario | Handling | User sees |
| -------- | -------- | --------- |
| Branch has no upstream | `rev-list` fails with `fatal: no upstream configured` — **verified in this repo**, it is not a zero result. `readSyncState` catches it, leaves `upstream: null`, sets no `error` | `no upstream`, and Publish in the popover (STBR-12) |
| Repo has no remote | `git remote` returns empty | The section says so; no write operation offered (STBR-13) |
| Detached HEAD | `rev-parse --abbrev-ref HEAD` returns `HEAD` | `(detached <sha>)`, no operations (STBR-08/13) |
| Any other git failure for that worktree | `gitFailureLine(err)` into `SyncState.error` | The section is replaced by that line; repo, branch and file counter keep rendering (STBR-14) |
| Diverged branch on Sync/Pull | `pull --ff-only` refuses and changes nothing | Git's own line, inline in the popover, which stays open (STBR-18) |
| No cached credentials | `GIT_TERMINAL_PROMPT=0` makes git fail fast | Git's line inline (STBR-18) |
| Operation exceeds 120 s | `execFile` `timeout` kills it; `isTimeout(err)` maps it | "timed out after 120 s"; the popover suggests the terminal (STBR-24) |
| Second operation on the same worktree | The busy map short-circuits | Buttons are already disabled; a race resolves `busy` and nothing runs (STBR-28) |
| Operation finishes after the popover closed | The hook's op map still holds the promise | Toast with the outcome (STBR-26) |
| Selected worktree path no longer exists | The tree already derives path-missing | No counters, no operations (Edge case) |

---

## Risks & Concerns

| Concern | Location | Impact | Mitigation |
| ------- | -------- | ------ | ---------- |
| **The Toast renders bottom-center — exactly where the bar goes** | `src/renderer/src/components/Toast.css`, `Toast.tsx:11` | Every toast in the app would sit on top of the new bar, and STBR-26's own toast is the most likely to collide | The bar's height becomes a CSS variable and the toast's `bottom` offset is expressed against it. One CSS change, no component change — recorded as a task, not left to discovery |
| `relativeTime` stops at hours and has no `never` | `src/renderer/src/lib/relative-time.ts:12` | A repo fetched three days ago reads `72h ago` | Add a `d ago` tier in the same pure function (its existing tests stay green); `never` is decided by `fetchAgeLabel`, not by `relativeTime` |
| `changedFilesOf` swallows every error and returns `[]` | `worktree-manager.ts:443` | A broken repo shows "no changes" instead of a problem — a silent lie the new popover would inherit | Out of scope to change (other consumers depend on it). The bar's **count** comes from `WorktreeNode.changes`, and STBR-14's degraded section is driven by `readSyncState`, which does not swallow. Recorded so the popover's empty state is never read as proof |
| `git rev-parse --git-common-dir` returns a **relative** `.git` in a primary checkout | verified in this repo | `stat`ing it from the wrong base silently yields `never` for every fetch age | `resolve(worktreePath, commonDir)` before `stat`; covered by a real-git test in a temp repo |
| Killing git on timeout may leave a Credential Manager window | `git.ts` `timeoutMs` | The GUI prompt outlives the operation the app abandoned | Out of the app's control and declared out of scope in the spec; the timeout message names the terminal as the way out |
| `App.tsx` grows again (AD-004 calls it a god component under incremental extraction) | `App.tsx` | More props threaded through an already large component | The bar takes **one** element and its state lives in `use-git-sync.ts`, following the `useSessions`/`useTree` precedent — the file gains a mount and a prop bundle, not logic |
| Real-git tests inflate suite runtime (lesson **L-005**) | `vitest.config.ts` | A green gate turning red with no production change | The raised 30 s `testTimeout`/`hookTimeout` that lesson produced is already in `vitest.config.ts`; the new suite creates one repo + one bare remote per describe, not per test |
| Spec wording: STBR-30 says "Modified / Added / Deleted" but `ChangeStatus` has five values | `spec.md` STBR-30 vs `shared/worktrees.ts:126` | A verifier reading the AC literally would call a `renamed` row a defect | **Spec-precision fix** — reword STBR-30 to "its change status" before Tasks. Recorded here rather than silently implementing five |

---

## Tech Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Where the file count comes from | `WorktreeNode.changes`, already in the tree snapshot | Zero new calls for the always-visible number; `worktrees:changes` runs only when the popover opens |
| Ahead/behind command | `rev-list --count --left-right @{upstream}...HEAD` (three dots) | One call for both numbers; its failure **is** the no-upstream signal (verified) |
| Fetch age source | Newest `FETCH_HEAD` mtime under the resolved git common dir and its `worktrees/*/` | Git writes `FETCH_HEAD` into the fetching worktree's own git dir, but the remote refs are shared; corrected 2026-09-19 after the T18 smoke |
| Sync order | `pull --ff-only` then `push`, aborting the push if the pull failed | Matches the app's existing `merge --ff-only` posture; cannot conflict, cannot create a merge commit |
| Publish remote | Required choice when `remotes.length > 1` | This repo's `origin` is someone else's upstream — a default would push the owner's work to the wrong place |
| Op lifetime | Owned by the hook's op map, keyed by worktree path | STBR-26 falls out of it: the promise does not belong to the popover that started it |
| Test split | Pure parsers + `status-bar.ts` in unit tests; `git-sync.ts` against a real temp repo with a bare remote; the bar and popovers hand-verified + CDP smoke | The project's convention (`TESTING.md`), and the only way to prove ff-only refusal and `push -u` without a network |

> **Project-level decision — recorded as AD-023 in `.specs/STATE.md` (2026-09-19):** *every git
> invocation in this app goes through `src/main/git.ts`* — no module spawns git directly, so
> `shell:false`, `windowsHide`, `GIT_TERMINAL_PROMPT=0` and the timeout ceiling are guaranteed in one
> place. It also pins that **the status bar never touches the network without an explicit user
> action**.

---

## Requirement Coverage

| Component | ACs |
| --------- | --- |
| `main/git.ts` | 27 (and the timeout half of 24) |
| `main/git-sync.ts` | 09, 12, 13, 14, 17–22, 24, 25 (recompute), 27, 28 |
| `lib/status-bar.ts` | 02, 03, 04, 05, 06, 08, 09, 12, 13, 14, 22 |
| `lib/use-git-sync.ts` | 11, 23, 25, 26 |
| `StatusBar.tsx` | 01, 02, 05, 06, 07, 29, 31 |
| `SyncPopover.tsx` | 15, 16, 18, 19, 20, 21, 23, 24 |
| `ChangesPopover.tsx` | 30, 31, 32 |
| `Toast.css` offset | (risk mitigation — no AC; guards 26) |

Every one of STBR-01..32 appears at least once.
