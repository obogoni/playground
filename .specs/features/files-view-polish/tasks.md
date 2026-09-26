# Files View Polish Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. A `ViewTab` (`use-files.ts`: file, diff and commit tabs) gains an optional `pinned`, absent meaning unpinned. Every rule lives in pure functions in `files-view.ts` — the strip order, pin and unpin, and one `tabsAfterBulkClose(action)` that returns the surviving keys and the next active key — so `use-files` only stores their answers and `FileTabs` only renders them. The context menu is inline in `FileTabs`, like the sidebar's and F3's.
**Status**: Approved 2026-09-26 with the reconciliation below, executed inline (planned 2026-09-22)

**Branch**: `feature/files-view-polish`, rebased onto `origin/main` `c31bb9a` on 2026-09-26 (F2 #101 and F3 #102 merged). The PR closes #108 and depends on nothing.

**Reconciled with `main` (2026-09-26)**: `ViewTab` lives in `use-files.ts` and now includes F3's `CommitTab`, so `pinned` goes on that union (T1 touches `use-files.ts` for the type only) and commit tabs follow every rule; `tabKeyOf`, `ALL_CHANGES_KEY` and `tabsWithAllChanges` live in `diff-view.ts`; the menu's dismiss effect and look come from `CommitList` (`.commit-ctx-menu`, AD-038) as much as from the sidebar. Every other anchor holds: `tabsAfterClose` in `files-view.ts`, `closeTab` in `use-files`, `file-tab-close` / `file-tabs-toggle` in `FileTabs`, `setExpanded` / `shown` / `mountPlan` in `AllChangesTab`, the 40-file seed in `smoke-files-diff.mjs`.

**Test baseline**: **re-measure** with `npx vitest run` as the first act of Execute; record the lint warning count at the same time.

**Smoke**: `scripts/smoke-files-diff.mjs` runs on a `--user-data-dir` and a seeded repo, and needs a freshly launched app and a fresh seed for every drive.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/files-view.test.ts` and `diff-view.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure tab rules (`files-view.ts`) | unit | 1:1 to FPOL-01, 03, 04, 06–11 and the three edge cases | `src/renderer/src/lib/files-view.test.ts` | `npm test` |
| Hook (`use-files.ts`) | none (smoke) | — | — | smoke |
| Components and CSS (`FileTabs`, `AllChangesTab`) | none (CDP smoke) | FPOL-02, 05, 12–17 in the running app | — | `node scripts/smoke-files-diff.mjs` |
| End to end | manual CDP smoke | Every new check seen failing on a broken build | `scripts/smoke-files-diff.mjs` | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Phase ends | `npx electron-vite build` |
| Manual | T9 | `node scripts/smoke-files-diff.mjs --seed` → launch with `--user-data-dir` and `--remote-debugging-port=9222` → `node scripts/smoke-files-diff.mjs` → `--clean` |

**Lint is judged by exit code AND by warning count** — record the count at T1 and diff it at every gate.

---

## Execution Plan

### Phase 1: Rules

```
T1 → T2
```

### Phase 2: Tabs on screen

```
T2 → T3 → T4 → T5
```

### Phase 3: All changes

```
T5 → T6 → T7
```

### Phase 4: Prove

```
T7 → T8 → T9
```

---

## Task Breakdown

### T1: Pin and strip order

**What**: an optional `pinned` on `ViewTab` (type only, in `use-files.ts`); `pinTab(tabs, key)` and `unpinTab(tabs, key)` returning the reordered list (pinned first in pin order; an unpinned tab first among the unpinned); a strip order helper that `tabsWithAllChanges` keeps putting after All changes.
**Where**: `src/renderer/src/lib/files-view.ts`; the `ViewTab` type in `src/renderer/src/lib/use-files.ts`
**Depends on**: None
**Reuses**: `tabKeyOf`, `ALL_CHANGES_KEY` (`diff-view.ts`)
**Requirement**: FPOL-01, FPOL-03, FPOL-04, FPOL-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: pin moves after earlier pins; unpin moves to the front of the unpinned; pinning the already-pinned and unpinning the unpinned change nothing; All changes is never moved or pinned; the active key is untouched by both
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + the new tests

**Done**: no separate strip-order helper was needed. The stored tabs are the strip minus All changes, new tabs are appended (`[...s.tabs, tab]`), and `pinTab`/`unpinTab` keep the pinned ones first, so `tabsWithAllChanges` already puts them right after All changes. 1663 → 1668 tests.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): pin a tab to the front of the strip`

---

### T2: Bulk close

**What**: `tabsAfterBulkClose(strip, active, action)` for `close`, `others`, `right`, `unpinned`, `all`, returning the surviving keys and the next active key.
**Where**: `src/renderer/src/lib/files-view.ts`
**Depends on**: T1
**Reuses**: `tabsAfterClose`'s adjacent rule, generalised
**Requirement**: FPOL-06, FPOL-07, FPOL-08, FPOL-09, FPOL-10, FPOL-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, one per action and per FPOL criterion: `all` keeps only All changes; `unpinned` keeps every pinned; `others` keeps the anchor and pinned; `right` closes only unpinned to the anchor's right; `close` on a pinned tab closes it; the active survives when kept; a closed active falls right, then left, then All changes, then `null` in Explore
- [x] `tabsAfterClose`'s existing tests pass unedited
- [x] Gate check passes: `npm test`
- [x] Test count: T1 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(files): close many tabs in one action`

---

### T3: `use-files` stores pins and bulk closes

**What**: `togglePin(key)` and `closeTabs(action, anchorKey?)` on `UseFiles`, applying T1's and T2's answers to the worktree's tabs and active key.
**Where**: `src/renderer/src/lib/use-files.ts`
**Depends on**: T2
**Reuses**: `closeTab`'s state update
**Requirement**: FPOL-01, FPOL-03, FPOL-06..11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done**: `closeTabs` takes T2's `BulkClose` value, which carries the anchor for Close, Close others and Close to the right, instead of a separate `anchorKey` argument.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): keep pinned tabs per worktree`

---

### T4: The strip's menu, pin and ⋯

**What**: Right-click on a tab opens its menu (Pin/Unpin, Close, Close others, Close to the right, Close unpinned, Close all); a pinned tab shows a pin button in place of ×; a ⋯ button ends the strip and opens Close unpinned and Close all; click outside or Escape dismisses; All changes gets no menu.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T3
**Reuses**: the dismiss effect of `CommitList`/`Sidebar` (any click or Escape); `Icon`
**Requirement**: FPOL-02, FPOL-05, FPOL-12, FPOL-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A `pin` icon exists in `Icon` (added here if missing)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done**: `Icon` gains Lucide's `pin` and `ellipsis`; the menu is one inline `StripMenu` state whose `anchor` is the right-clicked tab's key, or `null` for the ⋯ menu, which then shows only Close unpinned and Close all.

**Tests**: none
**Gate**: full

**Commit**: `feat(files): pin and close tabs from a menu`

---

### T5: Styles for the menu, pin and ⋯

**What**: The menu styled like `.sidebar-ctx-menu`, the pin button and the ⋯ button in both themes.
**Where**: `src/renderer/src/components/FileTabs.css`
**Depends on**: T4
**Reuses**: the tokens of `.commit-ctx-menu` and `.sidebar-ctx-menu`
**Requirement**: FPOL-02, FPOL-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(files): style the tab menu and the pin`

---

### T6: Expand all and Collapse all

**What**: Two buttons at the right of the All changes header setting the expanded set to every listed path or to none; hidden when nothing is listed.
**Where**: `src/renderer/src/components/AllChangesTab.tsx`
**Depends on**: T5
**Reuses**: `setExpanded`, `shown`
**Requirement**: FPOL-14, FPOL-15, FPOL-16, FPOL-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `mountPlan` untouched
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(files): expand or collapse every change at once`

---

### T7: Styles for the header buttons

**What**: The two header buttons, matching `file-tabs-toggle`.
**Where**: `src/renderer/src/components/AllChangesTab.css`
**Depends on**: T6
**Reuses**: `file-tabs-toggle` tokens
**Requirement**: FPOL-14, FPOL-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Gate check passes: `npm run lint` and `npx electron-vite build`

**Tests**: none
**Gate**: build

**Commit**: `style(files): style the expand and collapse buttons`

---

### T8: Smoke — pin and bulk close

**What**: A new section in `smoke-files-diff.mjs`: open five tabs, pin two through the context menu (they move after All changes and show pins), Close to the right, Close others, Close unpinned (pins survive), Close all (only All changes left), ⋯ opens its two entries, Escape dismisses without closing anything, All changes offers no menu.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T7
**Reuses**: the script's seeded repo, tab probes and `check`
**Requirement**: FPOL-01..13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Every new check seen **failing** with its rule broken (T2's `unpinned` keeping nothing; the pin reorder removed), then passing
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check pinning and bulk closes in the running app`

---

### T9: Smoke — expand and collapse all

**What**: On the forty-file stack, Expand all opens forty sections while the mounted editor count stays at `mountPlan`'s bound; Collapse all folds all forty; in a mode with no changes the buttons are absent.
**Where**: `scripts/smoke-files-diff.mjs`
**Depends on**: T8
**Reuses**: the stack probes of the FDIF-21 checks
**Requirement**: FPOL-14, FPOL-15, FPOL-16, FPOL-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Each check seen failing with its button wired to the wrong set, then passing
- [ ] The mounted-editor bound read from the DOM (`.monaco-editor` count), not assumed
- [ ] Gate check passes: `npm run lint` (warning count unchanged)

**Tests**: manual
**Gate**: manual

**Commit**: `test(files): check expanding and collapsing every change`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9
```

Nine tasks: two batches (Phases 1–2, Phases 3–4). At Execute the sub-agent offer is made first.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: pin rules | 2–3 pure functions, 1 file | ⚠️ Cohesive |
| T2: bulk close | 1 pure function | ✅ Granular |
| T3: hook | 2 actions in 1 hook | ⚠️ Cohesive |
| T4: menu | 1 component | ✅ Granular |
| T5: styles | 1 stylesheet | ✅ Granular |
| T6: buttons | 1 component | ✅ Granular |
| T7: styles | 1 stylesheet | ✅ Granular |
| T8: smoke | 1 section | ✅ Granular |
| T9: smoke | 1 section | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | Phase 1 start | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1: pin rules | pure tab rules | unit | unit | ✅ OK |
| T2: bulk close | pure tab rules | unit | unit | ✅ OK |
| T3: hook | hook | none | none | ✅ OK |
| T4: menu | component | none | none | ✅ OK |
| T5: styles | CSS | none | none | ✅ OK |
| T6: buttons | component | none | none | ✅ OK |
| T7: styles | CSS | none | none | ✅ OK |
| T8: smoke | end to end | manual | manual | ✅ OK |
| T9: smoke | end to end | manual | manual | ✅ OK |
