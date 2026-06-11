# Workspace Registration & Sidebar Tree — Tasks

**Design**: `.specs/features/workspace-sidebar-tree/design.md`
**Status**: In Progress

Gate commands (unchanged from app-skeleton):
- **quick** = `npm test` (vitest run)
- **build** = `npm run typecheck && npm run build`
- **full** = build + quick + manual `npm run dev` smoke check

---

## Execution Plan

```
Phase 1 (Sequential):   T1
Phase 2 (Parallel):     T1 ──┬→ T2 [P]  (registry)
                             ├→ T3 [P]  (scanner)
                             ├→ T4 [P]  (worktree list)
                             ├→ T6 [P]  (Sidebar view)
                             └→ T7 [P]  (Detail view)
Phase 3 (Sequential):   T2,T3,T4 ─→ T5  (orchestration + IPC)
Phase 4 (Sequential):   T5,T6,T7 ─→ T8  (App wiring)
```

---

## Task Breakdown

### T1: Shared tree types, config section, IPC channels

**What**: `src/shared/tree.ts` (WorkspaceEntry, WorktreeNode, RepoNode, WorkspaceNode per design §Data Models); `AppConfig` gains `workspaces: WorkspaceEntry[]` (default `[]`); `IpcContract` gains `workspaces:add`, `workspaces:remove`, `tree:get`.
**Where**: `src/shared/tree.ts`, `src/shared/config.ts`, `src/shared/ipc-contract.ts`
**Depends on**: None · **Reuses**: contract/channel pattern (AD-003 growth point) · **Requirement**: TREE-01..06 (foundation)

**Done when**:
- [ ] Types compile and flow through `RendererApi` with no `any`
- [ ] Gate check passes: build (handlers not yet registered — contract only)

**Tests**: none (types) · **Gate**: build
**Commit**: `feat(tree): shared tree model, workspaces config section, IPC channels`

---

### T2: WorkspaceRegistry + behavior tests [P]

**What**: `WorkspaceRegistry` wrapping an injected `ConfigStore`: `add(path)` (normalize → dedupe case-insensitive → `null` on dup; displayName = basename), `remove(id)`, `list()`.
**Where**: `src/main/workspace-registry.ts`, `src/main/workspace-registry.test.ts`
**Depends on**: T1 · **Reuses**: ConfigStore (injected temp dir in tests, per config-store.test.ts pattern) · **Requirement**: TREE-01, TREE-05

**Done when**:
- [ ] Behaviors: add persists round-trip (new ConfigStore on same dir sees it) · dedupe same path with different case/trailing slash → null · remove unregisters and persists · list order stable · remove never touches the workspace folder itself
- [ ] Gate check passes: `npm test` (≥5 new tests)

**Tests**: unit (behavior, real FS temp dirs) · **Gate**: quick
**Commit**: `feat(tree): WorkspaceRegistry with persistence and dedupe`

---

### T3: RepoScanner + behavior tests [P]

**What**: `scanRepos(workspacePath)` — single-level scan for child dirs containing a `.git` directory; ignores dot-dirs and `node_modules`; excludes `.git`-file children (linked worktrees); name-sorted; ENOENT propagates.
**Where**: `src/main/repo-scanner.ts`, `src/main/repo-scanner.test.ts`
**Depends on**: T1 · **Reuses**: temp-dir test pattern · **Requirement**: TREE-02

**Done when**:
- [ ] Behaviors (PRD §Testing): finds repos at depth 1 only · ignores `node_modules`/dot-dirs · `.git`-file child not listed as repo · stable ordering · missing path throws ENOENT · empty workspace → []
- [ ] Gate check passes: `npm test` (≥6 new tests)

**Tests**: unit (real FS temp dirs, no git needed — fake `.git` dirs/files suffice) · **Gate**: quick
**Commit**: `feat(tree): RepoScanner single-level git repo discovery`

---

### T4: WorktreeManager.list + behavior tests [P]

**What**: `listWorktrees(repoPath)` — `git worktree list --porcelain` block parsing (branch/detached/bare; first block → `isDefault`); per-worktree `git status --porcelain` → `dirty`/`changes`; `execFile` with cwd, no shell.
**Where**: `src/main/worktree-manager.ts`, `src/main/worktree-manager.test.ts`
**Depends on**: T1 · **Reuses**: temp-dir pattern · **Requirement**: TREE-02

**Done when**:
- [ ] Behaviors (PRD §Testing, list subset): single primary checkout · primary + linked worktree (flat sibling) · dirty counts (modified + untracked) · clean → 0 · detached HEAD labeled, no crash · non-repo path → typed error
- [ ] Tests init real git repos in temp dirs (`git init`, commits, `git worktree add`)
- [ ] Gate check passes: `npm test` (≥6 new tests)

**Tests**: integration (real git subprocess) · **Gate**: quick
**Commit**: `feat(tree): worktree listing with porcelain parsing and dirty status`

---

### T5: Tree orchestration + IPC handlers + folder picker

**What**: `buildTree(registry)` composing scanner + worktree list with per-node error embedding (`missing`, `RepoNode.error`), `Promise.all` per level; register `tree:get`, `workspaces:add` (with `dialog.showOpenDialog`), `workspaces:remove` in `main/index.ts`.
**Where**: `src/main/tree.ts`, `src/main/tree.test.ts`, `src/main/index.ts`
**Depends on**: T2, T3, T4 · **Reuses**: `handle()` wrapper; registry/scanner/manager · **Requirement**: TREE-01, TREE-02, TREE-05, TREE-06

**Done when**:
- [ ] buildTree behaviors: workspace with repos+worktrees snapshots correctly · missing workspace path → `missing: true`, others unaffected · failing repo → `error` on that node only
- [ ] Devtools: `window.api.invoke('tree:get')` returns real tree; `workspaces:add` opens picker, cancel → null
- [ ] Gate check passes: `npm test` + build

**Tests**: integration (buildTree with temp dirs; dialog wiring verified by hand) · **Gate**: quick + build
**Commit**: `feat(tree): tree snapshot orchestration and workspace IPC handlers`

---

### T6: Sidebar component [P]

**What**: Presentational `Sidebar` per handoff §1a: 286px pane, WORKSPACES header + "+" button, workspace rows (chevron/folder/name + hover-revealed remove button), repo rows (mono name + count pill), worktree rows (fork glyph, mono branch, amber dirty dot, untagged line 2, selected accent state), empty state, missing/error notes. New icons in `Icon.tsx` (folder, chevron-down, fork, trash, plus already exists?).
**Where**: `src/renderer/src/components/Sidebar.tsx` + CSS, `Icon.tsx`
**Depends on**: T1 · **Reuses**: tokens, Icon, §1a measurements verbatim · **Requirement**: TREE-03, TREE-05

**Done when**:
- [ ] Fully controlled via props (`tree, selectedId, onSelect, onAddWorkspace, onRemoveWorkspace`); no IPC inside
- [ ] Visual fidelity vs. `.dc.html` §1a (row paddings, type sizes, selection tint + inset bar)
- [ ] Gate check passes: build

**Tests**: none (React view per PRD) · **Gate**: build
**Commit**: `feat(tree): sidebar tree component per handoff §1a`

---

### T7: WorktreeDetail component [P]

**What**: Presentational `WorktreeDetail` per handoff §1b subset: breadcrumb, mono h1 (`overflow-wrap: anywhere`), status pills (dirty amber "N uncommitted change(s)" / green "Working tree clean" / neutral "primary"), LOCATION row with copy button (+ ~1.5s copied feedback), fadeIn entrance, empty state.
**Where**: `src/renderer/src/components/WorktreeDetail.tsx` + CSS, `Icon.tsx` (copy icon)
**Depends on**: T1 · **Reuses**: tokens; §1b measurements · **Requirement**: TREE-04

**Done when**:
- [ ] Props-only; clipboard via `navigator.clipboard` (only renderer-side effect)
- [ ] Pills match §1b spec (color-mix tints, radius 20, 12.5px/600); layout leaves insertion room for M2/M3 sections
- [ ] Gate check passes: build

**Tests**: none (React view) · **Gate**: build
**Commit**: `feat(tree): worktree detail pane per handoff §1b`

---

### T8: App wiring — tree state, selection, refresh

**What**: `App.tsx` owns `tree` + `selectedId`; loads `tree:get` on mount; Tree direction renders Sidebar + WorktreeDetail (Board placeholder unchanged); add/remove invoke channels then re-fetch; top-bar refresh → re-fetch with selection preserved-if-alive; selected-in-removed-workspace → empty detail.
**Where**: `src/renderer/src/App.tsx`, `App.css`
**Depends on**: T5, T6, T7 · **Reuses**: api client, all prior tasks · **Requirement**: TREE-01..06

**Done when**:
- [ ] Spec Independent Tests pass by hand: register/dedupe/cancel · real repos + dirty dots · selection + detail pills · copy path · remove workspace · external worktree add/remove + refresh round-trip
- [ ] Restart persistence: workspaces survive relaunch
- [ ] Gate check passes: full (build + all tests + dev smoke)

**Tests**: none new (modules covered T2–T5) · **Gate**: full
**Commit**: `feat(tree): wire sidebar and detail panes to live tree state`

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | start | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T1 | T1→T3 | ✅ Match |
| T4 | T1 | T1→T4 | ✅ Match |
| T5 | T2, T3, T4 | T2,T3,T4→T5 | ✅ Match |
| T6 | T1 | T1→T6 | ✅ Match |
| T7 | T1 | T1→T7 | ✅ Match |
| T8 | T5, T6, T7 | T5,T6,T7→T8 | ✅ Match |

Parallel group T2/T3/T4/T6/T7: no intra-group dependencies. ✅

## Test Co-location Validation

| Task | Code Layer | Baseline Requires (PRD §Testing) | Task Says | Status |
| ---- | ---------- | -------------------------------- | --------- | ------ |
| T1 | types/contract | none | none | ✅ OK |
| T2 | deep module (persistence) | behavior | unit | ✅ OK |
| T3 | deep module (FS) | behavior | unit | ✅ OK |
| T4 | deep module (git) | behavior, real git | integration | ✅ OK |
| T5 | orchestration + wiring | behavior for compose logic | integration | ✅ OK |
| T6 | React view | none (PRD: views untested) | none | ✅ OK |
| T7 | React view | none | none | ✅ OK |
| T8 | React view + wiring | none | none | ✅ OK |
