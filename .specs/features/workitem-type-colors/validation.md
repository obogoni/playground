# workitem-type-colors Validation

**Date**: 2026-08-31
**Spec**: `.specs/features/workitem-type-colors/spec.md`
**Diff range**: `42715b3..HEAD` (2 commits: 845d920 map+tests, 281f92a CSS) — Phase 2 re-validation after the user supplied the real ADO process palette
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status     | Notes |
| ---- | ---------- | ----- |
| T1   | ✅ Done    | Phase 1 map + tests (superseded by T4) |
| T2   | ✅ Done    | Phase 1 CSS (superseded by T5) |
| T3   | ✅ Done    | Read-only audit — all 6 surfaces on `typeClass` (re-confirmed below) |
| T4   | ✅ Done    | `typeClass()` re-sourced to the ADO process palette; tests updated in place (`task-pills.test.ts`) |
| T5   | ✅ Done    | `global.css` `tp-*` hexes replaced with process colors; `.tp-pbi` removed |

All five tasks are marked **✅ Complete** in `tasks.md` (lines 64, 93, 121, 148, 176). No blocked or partial tasks.

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: every AC traced to `file:line` + assertion expression. Spec palette is the **updated** source of truth: `spec.md:33-35` (working tree, ADO process colors fetched from `wit/workitemtypes` 2026-08-31). CSS is the component layer, hand-verified per repo convention `.specs/codebase/TESTING.md` (renderer/CSS deliberately not unit-tested — tasks.md:23).

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| ------------------------- | -------------------- | ----------------------- | ------ |
| TYPE-01: WHEN a work item of a type defined in the configured ADO process is displayed THEN badge renders with that type's process color | Bug `#f58b1f`, Task `#fbbc3d`, User Story `#0098c7`, Feature `#773b93`, Epic `#e06c00`, Issue/Code Review `#b4009e`, Fault `#e60017`, Initiative `#339947`, Request `#666666`, Test Case/Plan/Suite/Feedback/Shared Steps/Shared Parameter `#004b50` | `task-pills.test.ts:6-23` — 18 assertions, one per mapped type (`typeClass('Bug')`→`'tp-bug'` line 6, `'Task'`→`'tp-task'` line 7, `'User Story'`→`'tp-user-story'` line 8, `'Feature'`→`'tp-feature'` line 9, `'Epic'`→`'tp-epic'` line 10, `'Issue'`→`'tp-issue'` line 11, `'Code Review Request'/'Response'`→`'tp-code-review'` lines 12-13, `'Fault'`→`'tp-fault'` line 14, `'Initiative'`→`'tp-initiative'` line 15, `'Request'`→`'tp-request'` line 16, `'Test Case/Plan/Suite'`→`'tp-test-*'` lines 17-19, `'Feedback Request/Response'`→`'tp-feedback'` lines 20-21, `'Shared Steps/Parameter'`→`'tp-shared-*'` lines 22-23); CSS: `global.css:117-171` (`.tp-bug` `#f58b1f` 117-120, `.tp-task` `#fbbc3d` 122-125, `.tp-user-story` `#0098c7` 127-130, `.tp-feature` `#773b93` 132-135, `.tp-epic` `#e06c00` 137-140, `.tp-issue`/`.tp-code-review` `#b4009e` 142-146, `.tp-fault` `#e60017` 148-151, `.tp-initiative` `#339947` 153-156, `.tp-request` `#666666` 158-161, `.tp-test-*`/`.tp-feedback`/`.tp-shared-*` `#004b50` 163-171) | ✅ PASS |
| TYPE-02: WHEN the work item type is not defined in the configured ADO process THEN badge renders neutral `muted` | `muted` | `task-pills.test.ts:27-30` — `expect(typeClass('Product Backlog Item')).toBe('muted')` (line 27), `('Impediment')` (28), `('Chore')` (29), `('Requirement')` (30); default branch `task-pills.ts:41-42`; `.tp-pbi` rule removed — no `tp-pbi` match anywhere in `src/` (grep) | ✅ PASS |
| TYPE-03: type match SHALL be case-insensitive | `"user story"` == `"User Story"` == `"USER STORY"` | `task-pills.test.ts:34-37` — `expect(typeClass('user story')).toBe('tp-user-story')` (34), `expect(typeClass('USER STORY')).toBe('tp-user-story')` (35), `expect(typeClass('BUG')).toBe('tp-bug')` (37); `task-pills.ts:6` (`type.trim().toLowerCase()`) | ✅ PASS |
| TYPE-04: WHILE light or dark theme THEN badge keeps mapped color with standard tinted background | Text in process hex + `color-mix(… 16%, transparent)` background (both themes) | `global.css:117-171` — every `.task-pill.tp-*` uses `background: color-mix(in oklab, <hex> 16%, transparent)` (matches the existing pill pattern, e.g. `.task-pill.muted` at 109-112); no state-pill class (`red`/`amber`/`green`/`blue`/`accent`/`faint`/`muted`) changed in the diff. Hand-verified layer per TESTING.md | ✅ PASS (hand-verified, no theme-specific unit test — matches repo convention) |
| TYPE-05: IF the type string is empty or whitespace THEN badge renders neutral | `muted` | `task-pills.test.ts:41-42` — `expect(typeClass('')).toBe('muted')` (41), `expect(typeClass('   ')).toBe('muted')` (42); `task-pills.ts:6` (`trim()` → default) | ✅ PASS |
| TYPE-06: IF the type is from another process (Product Backlog Item, Impediment, Chore) THEN badge renders neutral | `muted` | `task-pills.test.ts:27-29` — `('Product Backlog Item')`, `('Impediment')`, `('Chore')` → `muted`; `task-pills.ts:41-42` | ✅ PASS |

**Hex cross-check (spec.md:34 vs global.css, exact match):** `#f58b1f`→`.tp-bug` (117-120), `#fbbc3d`→`.tp-task` (122-125), `#0098c7`→`.tp-user-story` (127-130), `#773b93`→`.tp-feature` (132-135), `#e06c00`→`.tp-epic` (137-140), `#b4009e`→`.tp-issue`/`.tp-code-review` (142-146), `#e60017`→`.tp-fault` (148-151), `#339947`→`.tp-initiative` (153-156), `#666666`→`.tp-request` (158-161), `#004b50`→`.tp-test-*`/`.tp-feedback`/`.tp-shared-*` (163-171). All 10 hexes exact.

**Status**: ✅ All 6 ACs covered — 6/6 matched spec outcome, 0 spec-precision gaps.

---

## Discrimination Sensor

**Sensor depth**: lightweight (3 targeted behavior-level mutations, the feature's whole risk surface — re-run for the process-palette iteration).

Scratch: `D:\worktrees\type-sensor2` (`git worktree add --detach HEAD` at 281f92a, node_modules junction). Mutations applied one at a time to the scratch copy of `src/renderer/src/lib/task-pills.ts`, then `npx vitest run src/renderer/src/lib/task-pills.test.ts`.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| 1 | `task-pills.ts:7-8` | Changed `case 'bug': return 'tp-bug'` → `return 'muted'` | ✅ Killed (2 failed — `Bug` assertion line 6 and `BUG` assertion line 37) |
| 2 | `task-pills.ts:22-23` | Removed `case 'fault'` entirely → `'fault'` falls through to `default` (`muted`) | ✅ Killed (Fault assertion line 14 fails) |
| 3 | `task-pills.ts:6` | Removed `.trim()` → `switch (type.toLowerCase())` | ✅ Killed (1 failed — `'  User Story  '` trim assertion line 36) |

**Result**: 3/3 killed — **PASS ✅**

**Isolation**: baseline `git status --porcelain` = ` M .specs/features/workitem-type-colors/spec.md` (⚠️ deviation from "must be empty": the spec.md palette update is uncommitted in the working tree — docs only, no code impact; recorded, not "fixed" per no-commit constraint). After junction removal + `git worktree remove --force`, porcelain is identical to baseline. No `git stash` used.

---

## Interactive UAT Results

Not performed — renderer-logic feature; visual color rendering is covered by the CSS layer hand-verification + sensor, per validate.md (UAT only for complex user-facing flows) and TESTING.md convention.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — switch extended in place, no new abstractions, no "flexibility" |
| Surgical changes | ✅ — only `task-pills.ts`, `task-pills.test.ts`, `global.css` touched in code (plus spec/tasks docs); `stateClass()` untouched (`task-pills.ts:47-62`) |
| No scope creep | ✅ — `stateClass` and `.red/.amber/.green/.blue/.accent/.faint/.muted` unchanged; `.tp-pbi` removed (type no longer in process); selectors grouped by shared color (`.tp-issue, .tp-code-review` 142-143; `.tp-test-*/.tp-feedback/.tp-shared-*` 163-168) |
| Matches patterns | ✅ — switch on lowercased input mirrors `stateClass`; tinted-background pattern mirrors the existing pill classes; co-located `*.test.ts` per TESTING.md |
| Spec-anchored outcome check | ✅ — every asserted class name is the exact `tp-*`/`muted` value the updated spec requires; CSS hex values match the spec map exactly (cross-check above) |
| Per-layer Coverage Expectation met | ✅ — domain map 1:1 to TYPE-01/02/03/05/06; CSS/components hand-verified per TESTING.md |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — 4 `it` blocks map to TYPE-01, TYPE-02/06, TYPE-03, TYPE-05; no orphan tests |
| Documented guidelines followed | ✅ — `.specs/codebase/TESTING.md` (co-location, pure-function pattern, renderer/CSS hand-verify) |

**Tests are non-shallow**: they assert concrete class names (`'tp-bug'`, `'tp-code-review'`, `'muted'`) and specific strings (`'Code Review Response'`, `'  User Story  '`, `'Product Backlog Item'`), not generic truthiness — confirmed by the sensor killing all 3 injected behavior faults.

---

## Edge Cases

- [x] Empty/whitespace type string → `muted`: `task-pills.test.ts:41-42`, `task-pills.ts:6` + default — handled correctly
- [x] Type from another process (Product Backlog Item, Impediment, Chore) → `muted`: `task-pills.test.ts:27-29`, `task-pills.ts:41-42` — handled correctly (updated spec edge case, spec.md:68)
- [x] Case-insensitivity + surrounding whitespace (`'  User Story  '`): `task-pills.test.ts:36` — handled correctly (trim + lowercase)

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test` (Full gate, tasks.md:33)
- **Result**: typecheck ✅ (node + web) · lint ✅ (0 errors, 18 warnings — all pre-existing in `scripts/*.mjs`/`fixtures`, none in changed files) · **635 passed, 0 failed, 0 skipped** (42 files, vitest run)
- **Test count before iteration**: 635 (prior validation pass at 42715b3)
- **Test count after iteration**: 635
- **Delta**: 0 — tests were **updated in place, not added** (same 4 `it` blocks in `task-pills.test.ts`; assertions re-sourced to the process palette)
- **Skipped tests**: none
- **Failures**: none
- **Integrity**: no deletions, no weakened assertions (assertions became *more* specific: PBI/Impediment/Chore now pinned to `muted`, 18 mapped-type assertions vs 9 before)

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| TYPE-01 | Verified (default palette) | ✅ Verified (process palette) |
| TYPE-02 | Verified | ✅ Verified |
| TYPE-03 | Verified | ✅ Verified |
| TYPE-04 | Verified | ✅ Verified |
| TYPE-05 | Verified | ✅ Verified |
| TYPE-06 | Verified | ✅ Verified |

spec.md working-tree statuses already reflect Verified (spec.md:76-81).

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/6 ACs matched spec outcome · 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: full gate green — 635 tests, 0 failed, 0 skipped

**What works**:
- All 14 ADO process types map to `tp-*` classes with exact process hex colors (TYPE-01) — Bug orange `#f58b1f`, Fault red `#e60017`, Test/Feedback/Shared teal `#004b50`, etc.
- Types the process does not define (Product Backlog Item, Impediment, Chore, Requirement) fall to neutral `muted`; `.tp-pbi` fully removed (TYPE-02/06)
- Case-insensitive + trim-safe matching (TYPE-03)
- Tinted `color-mix` background per existing pill pattern works on both themes (TYPE-04)
- All six badge surfaces render via `typeClass` — no hard-coded color stragglers (Sidebar:308, TasksPane:161, BoardView:328, WorktreeDetail:241, AgentsView:230, SessionRail:153)

**Issues found**:
- ⚠️ Minor (housekeeping, not a defect): `spec.md` palette update is **uncommitted** in the working tree (`git status` shows ` M .specs/features/workitem-type-colors/spec.md`). Baseline requirement "porcelain empty" could not be met; isolation was instead verified against this baseline. Docs only — no code impact. Recommend committing it with the feature (per no-commit constraint, the Verifier left it as-is).

**Next steps**: none blocking — feature is ready. Commit the spec.md working-tree change before PR. No fix tasks generated.