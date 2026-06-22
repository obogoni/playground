# Force-Remove Worktree (confirmed, with change preview) Specification

**Milestone:** Post-v2 enhancement (extends M2 _Delete Worktree (guarded)_)
**Sources of truth:** this conversation (user request), `delete-worktree/spec.md` (the guard this feature overrides), `worktree-manager.ts` (`removeWorktree({ force })` — backend already supports force), `WorktreeDetail.tsx` + `RemoveWorktreeConfirm.tsx` (the UI surfaces touched), `agent-config/spec.md` AGCF-05 (the running-agents confirm this feature merges with)
**Scope size:** Medium→Large — full spec + requirement IDs + inline design + explicit `tasks.md` (touches shared types, backend porcelain parsing, IPC contract, main handler, two React components, unit tests, smoke)

## Problem Statement

The _Delete Worktree (guarded)_ feature deliberately made dirty worktrees **unremovable from the UI**: the Remove button goes disabled-look with "commit or stash before removing", and the `force` path on `WorktreeManager.remove` — though implemented and unit-tested — has no UI entry point (the IPC handler hardcodes no-force; see `index.ts:106` "No force path from the UI in v1").

In daily use that guard is too strict. Plenty of worktrees end their life with throwaway dirt — a scratch file, a `console.log`, a half-edit the developer doesn't want — and the only escape is to drop to a terminal and run `git worktree remove --force` by hand, the exact friction this app exists to remove. This feature opens a **deliberate, informed** force-remove path: clicking Remove on a dirty worktree opens a confirmation that **lists the changed files (path + status)** so the developer can decide without leaving the app, then force-removes on confirm. The primary-checkout refusal is untouched (git itself cannot force-remove a main working tree).

## Goals

- [ ] Remove a dirty, non-primary worktree from its detail pane through one deliberate confirmation — folder gone, row gone, uncommitted work discarded knowingly
- [ ] The confirmation **lists every changed path with a human status label** (Modified / Added / Deleted / Untracked / Renamed), fetched **fresh** when the dialog opens (never trusted from the stale tree snapshot), so the developer needn't open a terminal to see what they're about to lose
- [ ] The dirty Remove button becomes an **enabled danger** control (not disabled-look), with an inline note stating "N uncommitted change(s) will be discarded on remove"
- [ ] The primary-checkout case is **still a hard refusal** — no force path exists for it (git cannot remove a main working tree)
- [ ] When a worktree is **both dirty and has running agents**, a single confirmation covers both (lists sessions to terminate **and** changes to discard); confirm terminates agents then force-removes
- [ ] `force` flows through the IPC contract end-to-end; the changed-file list is exposed via a dedicated lightweight read (the tree snapshot stays lean — no per-file data on every `tree:get`)
- [ ] Backend change-parsing is unit-tested on real temp git repos (mixed modified/added/deleted/renamed/untracked); existing remove tests stay green

## Out of Scope

| Feature | Reason |
| --- | --- |
| Auto-stash / auto-preserve before force-remove | Same stance as v1: the confirmation makes the loss explicit and informed; preserving is a separate "stash on remove" feature, not this one |
| Type-to-confirm (typing the branch name) | User decision: a clearly-styled danger button is the agreed friction level; the change list already makes the consequence concrete |
| Force-removing the primary checkout | Git cannot remove a main working tree; the refusal is intrinsic, not a policy we can override |
| Deleting the branch alongside the worktree | Unchanged from v1: removal is worktree-only; the branch (the task link) survives |
| Per-file diff / discard-selected-files | The prompt shows _what_ will be lost, not a staging UI; partial discard is a terminal/IDE job |
| Pruning stale/broken worktree entries | Separate concern (`git worktree prune`), as in v1 |

---

## Decisions (gray areas resolved during Specify)

- **Change detail = path + human status label** _(user-selected)_: the dialog renders each changed file as `<path> — <Modified|Added|Deleted|Untracked|Renamed>`, derived from the `git status --porcelain` two-char code. Chosen over bare paths (less informative) and category-only counts (defeats the "don't make me check" goal).
- **Friction = a single danger button** _(user-selected)_: the dialog's primary action is a red "Discard & remove" button (mirrors the existing `dialog-btn-danger` in `RemoveWorktreeConfirm`). No type-to-confirm — the visible change list is the safeguard.
- **Dirty button = enabled danger, not disabled-look** _(user-selected)_: `removable` widens to allow dirty (still excludes primary). The dirty button keeps the armed red style and its inline note flips from "commit or stash before removing" to "N uncommitted change(s) will be discarded on remove". The primary-checkout button stays disabled-look with its unchanged note.
- **Fresh fetch, not snapshot**: the changed-file list is read on dialog-open via a dedicated IPC (`worktrees:changes`), not carried in `tree:get`'s `WorktreeNode`. Rationale: (1) keeps the frequently-rebuilt tree snapshot lean — file lists would bloat every refresh; (2) the snapshot can be stale, and the same fresh-recheck discipline that `removeWorktree` already applies must govern what the dialog shows. The backend `removeWorktree({ force })` still does its own independent recheck — the dialog's list is for display, never the authority for the remove.
- **One dialog for both guards**: `RemoveWorktreeConfirm` is extended (not duplicated) to optionally show a changes section alongside its existing sessions section. The four states — clean+agents (today's behavior), dirty+no-agents, dirty+agents, and clean+no-agents (no dialog, removes straight away) — are all handled by one component driven by props. The stale note "A worktree with uncommitted changes still can't be removed." is **removed**.
- **Primary refusal preserved**: `removeWorktree` already refuses primary even under `{ force: true }` (the path-identity guard runs before the force branch); git would refuse anyway. No change needed there.

---

## Design (inline)

### Data shape

A changed file is `{ path, status }` where `status` is a narrow union derived from porcelain:

```ts
// src/shared/worktrees.ts
export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
export interface ChangedFile {
  path: string
  status: ChangeStatus
}
```

Porcelain → status mapping (the two-char `XY` code, X=index, Y=worktree):

- `??` → `untracked`
- `R` in either column → `renamed` (path shown is the destination, after the `-> ` arrow)
- `D` in either column → `deleted`
- `A` in either column → `added`
- otherwise (`M`, `MM`, ` M`, `T`, …) → `modified`

This is a presentational label, not a faithful git state machine — when index and worktree disagree, the more destructive/relevant single label wins per the order above. The existing `statusOf` keeps returning `{ dirty, changes }` for the tree; a new sibling parser produces the list.

### Backend

- Extract a pure `parseChangedFiles(porcelainStdout: string): ChangedFile[]` (unit-testable without git) and a `changedFilesOf(worktreePath): Promise<ChangedFile[]>` that runs `git status --porcelain` and parses it (mirrors `statusOf`, same swallow-on-error stance → `[]`).
- `removeWorktree({ force })` is **unchanged** — it already skips the dirty pre-check and runs `--force`. The only backend addition is the change reader.

### IPC

- Extend the existing request: `'worktrees:remove'.req` gains `force?: boolean`. Handler passes it through: `removeWorktree(repoPath, worktreePath, { force })`. The `index.ts:106` "no force path" comment is removed.
- Add `'worktrees:changes': { req: { worktreePath: string }; res: ChangedFile[] }` for the dialog's fresh fetch.

### Renderer

- `WorktreeDetail`: `removable` becomes `!isDefault` (dirty no longer blocks). The dirty button uses the armed style; its `remove()` opens the confirm dialog (now also for the dirty-only case, not just running-agents). On confirm, `doRemove()` passes `force: worktree.dirty` and the IPC call includes it. The inline guard note for dirty flips to the "will be discarded" wording; primary's note + disabled-look stay.
- `RemoveWorktreeConfirm`: gains optional `changes: ChangedFile[]` (and a `loadingChanges` flag) and renders a changes section (icon + path + status pill per row) when non-empty. The confirm button label adapts: "Discard & remove" when dirty, "Terminate & remove" when only agents, "Terminate, discard & remove" when both. Title/body copy adapts to which guards apply. The component stays presentational; `WorktreeDetail` fetches `worktrees:changes` when opening the dialog and passes the result down.

### Flow on confirm

`confirmRemove()` = (if running agents) stop them all → then `doRemove()` with `force: dirty`. Agent-stop failure still aborts and surfaces inline, exactly as today. Primary is never reachable here (button disabled for it).

---

## User Stories

### P1: Force path in IPC + change reader ⭐ MVP

**User Story**: As a developer, I want the app to force-remove a dirty worktree when I explicitly ask, and to tell me which files I'm discarding, so that I can finish cleanup without dropping to a terminal.

**Acceptance Criteria**:

1. WHEN `'worktrees:remove'` is invoked with `force: true` THEN the handler SHALL call `removeWorktree(repoPath, worktreePath, { force: true })` and the worktree SHALL be removed despite uncommitted changes, returning `{ ok: true }`
2. WHEN `'worktrees:remove'` is invoked with `force` absent/false on a dirty worktree THEN the existing dirty refusal SHALL still apply (unchanged behavior — no accidental forcing)
3. WHEN `'worktrees:changes'` is invoked for a worktree path THEN it SHALL return the live `git status --porcelain` parsed into `{ path, status }[]`, `[]` when clean or unreadable
4. WHEN `parseChangedFiles` receives porcelain with modified/added/deleted/renamed/untracked entries THEN each SHALL map to the correct `ChangeStatus`, renames SHALL surface the destination path, and the count SHALL match `statusOf`'s `changes`
5. WHEN `worktreePath` equals `repoPath` (primary) THEN `removeWorktree` SHALL refuse **even with `force: true`** (path-identity guard precedes the force branch)

**Independent Test**: Vitest on real temp git repos — `parseChangedFiles` over a worktree with one of each change type returns the right labels and destination path for the rename; `removeWorktree({ force: true })` removes a dirty worktree (folder gone) and still refuses the primary.

---

### P1: Dirty Remove button arms as a danger control ⭐ MVP

**User Story**: As a developer, I want the Remove button on a dirty worktree to be clickable (clearly as a destructive action) instead of disabled, so that force-removal is discoverable in the same place as normal removal.

**Acceptance Criteria**:

1. WHEN a worktree is dirty and non-primary THEN the Remove button SHALL be **enabled** with the armed red style (not the disabled-look), and the inline note SHALL read "N uncommitted change(s) will be discarded on remove"
2. WHEN a worktree is the primary checkout THEN the button SHALL stay disabled-look with the unchanged "primary checkout — can't be removed here" note (force does not apply)
3. WHEN a worktree is clean and non-primary THEN the button behaves exactly as today (armed; removes via the no-agents fast path or the agents confirm)
4. WHEN the dirty button is clicked THEN it SHALL open the confirmation dialog (never remove straight away), and the button SHALL disable while any IPC is in flight

**Independent Test**: Select a dirty worktree — button is red/active with the "will be discarded" note; select the primary — button is disabled-look with its own note; clean sibling — unchanged.

---

### P1: Confirmation lists the changes (and sessions) ⭐ MVP

**User Story**: As a developer, I want the remove confirmation to list the files I'm about to discard, with what kind of change each is, so that I can decide safely without checking git myself.

**Acceptance Criteria**:

1. WHEN the dialog opens for a dirty worktree THEN it SHALL fetch `worktrees:changes` fresh and render one row per changed file: status icon/pill + path + human label (Modified/Added/Deleted/Untracked/Renamed)
2. WHEN the dialog is also covering running agents THEN both sections SHALL appear (sessions to terminate **and** changes to discard), and the confirm button label SHALL reflect both ("Terminate, discard & remove")
3. WHEN only agents are running (clean worktree) THEN the dialog matches today's behavior (sessions section only; label "Terminate & remove"); the stale "uncommitted changes still can't be removed" note SHALL be gone
4. WHEN only changes exist (no agents) THEN the dialog shows just the changes section with the "Discard & remove" danger button
5. WHEN confirmed THEN running agents (if any) SHALL be terminated first, then `worktrees:remove` SHALL be called with `force: true`; on success the tree refreshes and the repo's primary is selected (unchanged from v1); a toast confirms "Removed <branch>"
6. WHEN the change fetch is in flight THEN the dialog SHALL show a brief loading state rather than an empty list, and a fetch failure SHALL not block removal (the backend rechecks regardless)

**Independent Test**: CDP smoke (`smoke-remove.mjs` extension) — make a sibling worktree dirty (modify + add + delete files), open Remove, assert the dialog lists each file with the right label, confirm, assert the row vanishes and the toast shows the branch.

---

### P2: Force-remove error + edge messaging

**User Story**: As a developer, I want force-removal failures and edge cases to surface clearly, so that I can recover without confusion.

**Acceptance Criteria**:

1. WHEN `git worktree remove --force` fails (e.g. a file locked by another process) THEN the failure SHALL surface inline in the Danger section with git's first error line, the worktree intact
2. WHEN the worktree path vanished on disk THEN force-remove SHALL still clean up git's stale entry (as the clean case does today) and the tree refresh reconciles
3. WHEN the `worktrees:changes` fetch returns `[]` for a worktree the snapshot called dirty (changes committed/discarded since last refresh) THEN the dialog SHALL show "No uncommitted changes" rather than a phantom list, and removal proceeds as a clean remove

**Independent Test**: Lock a file in a dirty worktree, confirm force-remove — inline error appears, worktree still listed after manual refresh.

---

## Edge Cases

- WHEN a rename has a `->` in porcelain (`R  old -> new`) THEN the listed path SHALL be the destination (`new`) labeled Renamed
- WHEN both index and worktree columns carry changes for one file (`MM`, `AD`) THEN one row SHALL appear with the single most-relevant label (deleted > added > renamed > modified precedence)
- WHEN the changed-file list is long THEN the section SHALL scroll within the dialog (cap the visible height; do not push the buttons off-screen) — mirror the existing `rwc-list` scroll treatment
- WHEN a path contains spaces or non-ASCII THEN it SHALL render verbatim (porcelain may quote/escape such paths; parse accordingly — strip surrounding quotes git adds for special chars)
- WHEN the worktree is detached-HEAD and dirty THEN force-remove SHALL work like any non-primary dirty worktree
- WHEN untracked files are the only changes THEN they SHALL be listed (Untracked) and force-remove SHALL discard them (the v1 "untracked still counts as work" rule is preserved, but now overridable)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| FRWT-01 | P1: Force path in IPC + change reader | Pending | — |
| FRWT-02 | P1: Dirty Remove button arms as danger | Pending | — |
| FRWT-03 | P1: Confirmation lists changes (and sessions) | Pending | — |
| FRWT-04 | P2: Force-remove error + edge messaging | Pending | — |

**Coverage target:** 4 requirements. New unit tests on `parseChangedFiles` + `removeWorktree({ force })` dirty-removal/primary-refusal (extend `worktree-manager.test.ts`); React surfaces verified via extended `scripts/smoke-remove.mjs` + a visual pass of the dialog's changes section.

---

## Testing Notes

- Extend `src/main/worktree-manager.test.ts` (real temp git repos): `parseChangedFiles` label mapping for M/A/D/R/?? incl. rename destination; `changedFilesOf` count parity with `statusOf`; `removeWorktree({ force: true })` removes a dirty worktree (modified + untracked + deleted) and the folder vanishes; primary still refuses under force. Anchor the new expected-pass count to the current baseline (no deletions).
- IPC additions (`force` field, `worktrees:changes`) follow `ipc-contract.ts`; failures returned/empty, never thrown.
- React (`WorktreeDetail`, `RemoveWorktreeConfirm`) unit-untested by convention — verified via the extended CDP smoke + a visual pass of the new changes section against the existing dialog styling.
- Gate: `npm run typecheck && npm run lint && npm test` before PR; `node scripts/smoke-remove.mjs` on a live session for the dialog flow.

## Success Criteria

- [ ] From a fresh app start: make a sibling worktree dirty, click Remove — dialog lists each changed file with its status label, confirm, folder gone + tree updated + primary selected + toast (smoke-verified)
- [ ] Primary checkout still cannot be removed (disabled-look; main refuses under force)
- [ ] Dirty + running agents: one dialog shows both sections; confirm terminates then force-removes
- [ ] `parseChangedFiles` + `removeWorktree({ force })` cases green in Vitest; full gate green
- [ ] Visual pass of the dialog's changes section against the existing `RemoveWorktreeConfirm` styling
