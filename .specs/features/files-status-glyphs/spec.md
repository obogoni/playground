# Files Status Glyphs Specification

## Problem Statement

In the Files view a changed file's status letter (M, A, D, R, U) is a coloured pill before the file
icon and the name. Names have different lengths, so the eye jumps to the left edge of every row to
find the status, and nothing else tells a deleted or an added file apart: a deleted file's name
reads exactly like a modified one. The All changes section headers do the same, with the letter
right after the chevron and before the path.

## Goals

- [ ] Every status in a changed list reads top to bottom in one column at the right edge, in the tree and in the section headers
- [ ] An added file shows `+` and a deleted file's name is struck through, so both read before their glyph
- [ ] One mapping from status to glyph, tooltip and tone serves the tree and the headers

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Status in tabs | Owner decision (issue #131): tabs keep showing no status |
| Changing the status colours or the file icons | Issue #131 out of scope; the icons are #111 / PR #126 |
| The remove-worktree dialog's status words (`RemoveWorktreeConfirm.tsx:31`) | Not one of the two copies the issue names; it shows words, not glyphs |
| A status on folder rows | Not requested; folders carry no status today |
| The hover discard action before the glyph | Issue #132, stacked on this branch; this feature only leaves room for it |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Glyphs | Added `+`; modified `M`, deleted `D`, renamed `R` stay letters; untracked keeps `U` | Owner decision (issue #131) | y |
| Tones | Today's: M amber, `+` green, D red, R accent, U muted text on a faint tint (`FileTree.css:136-159`) | Owner decision (issue #131): "colours stay as today" | y |
| Glyph look | Today's 16 px tinted pill, 10 px bold, only its content and place change | "Colours stay as today"; the issue's mockup is plain text and cannot show a tint | n (owner confirmed 2026-09-26) |
| Tree position | Last element of a file row, flush with the row's right padding; the name flexes and ellipses | Owner decision (issue #131) | y |
| Header position | Last element of the header, after the `+N −N` counts, flush with the header's right padding | Owner decision (issue #131) | y |
| Strikethrough | `text-decoration: line-through` on the name (tree) or path (header) text only | Owner decision (issue #131) | y |
| Tooltips | The glyph's `title` names the status: `Modified`, `Added`, `Deleted`, `Renamed`, `Untracked` | Today's labels (`FileTree.tsx:37-43`), kept by the issue | y |
| Shared mapping | A pure `changeStatusView(status)` in `src/renderer/src/lib/change-status.ts` returns glyph, label and strike; one `StatusGlyph` component and stylesheet replace both letter maps and both pill stylesheets | Owner decision (issue #131) for the mapping; one stylesheet keeps the two places from drifting apart | y |
| Commit tab headers | Covered by reuse: `CommitTab.tsx:43` mounts `AllChangesTab`, which renders `DiffSection` | Issue #131 names commit headers; nothing commit-specific to build | y |
| Untracked in diff-to-origin | Never listed: that mode reads `git diff --name-status` (`file-tree.ts:216`), which has no untracked status; `U` appears only in the uncommitted list and its stack | Fact of the data source | y |
| Very deep rows | Where the indent alone fills the row (about ten levels at the column's 200 px minimum), the glyph is pushed past the column like the name already is; no change | The indent grows 13 px per level (`FileTree.tsx:46-48`); fixing it means a different indent model, outside this issue | n (owner confirmed 2026-09-26) |
| A name or path that fits | Shows whole, with no ellipsis (FSTS-22, FSTS-23); criteria 4 and 20 only say what happens when it is too long | The Verifier's round 2 spec-precision note: a mutant that caps every name at 40 px, so names that fit are cut too, broke no criterion as written | y (owner confirmed 2026-09-27) |
| Fitting samples near their bound (the Verifier's Fix 8) | Accepted, not fixed: checks 9 and 17 keep the seed's names and paths; a cap on the name or path width that falls between the widest fitting sample and its space is not caught | Any seed leaves some slack, and the 1 px spare in the fit check already catches every cut that reaches a sample (a 0.5 px cut fails); the Verifier's round 3 V6 (a 120 px name cap) and V6h (a 700 px path cap) survive on that slack | y (owner accepted 2026-09-27; the fit samples are ≥ 78 px (tree) / ≥ 210 px (headers) short of their space, so a width cap between them passes) |
| A glyph pulled inside its end group over its neighbour (the Verifier's Fix 10, W4 / W4h) | Accepted, not fixed: the overlap rule (T18) compares a row's or header's direct children, so it reads the end group's box, not the glyph's; a glyph shifted inside the group by less than the group's gap is not caught | The fix round's cost kept growing against smaller and smaller smoke-only gaps, with the production code correct since round 1; #132 fills the same end group and can measure its children then | owner accepted 2026-09-27 |
| Room for the discard action (#132) | The glyph sits inside an end group (`.file-tree-end`, `.diff-section-end`) that #132 fills with its action before the glyph | Orchestrator instruction; see the hand-off note in `tasks.md` | y |
| Smoke home | `scripts/smoke-files-diff.mjs`, a new section before the icon section (which reloads the window and must stay last) | Its seed already has M, A, D, R in diff-to-origin and M, U uncommitted, plus the All changes stack | y |
| Seed additions | An untracked file with a long name in `src/` (12 lines) and an uncommitted change to the binary `assets/logo.bin` | The long name proves the ellipsis; the 12 lines and the binary give headers of different count widths and one with no counts, so a glyph misplaced before the counts cannot pass | y |
| Base branch | `feature/files-status-glyphs` off `feature/file-icons` `422d68d` (PR #126); rebased once #126 lands | Owner-approved stack (issue #131: depends on #126) | y |

**Open questions:** none — the two `owner confirmed 2026-09-26` defaults above are logged and reported, and the fitting-name criterion was confirmed by the owner on 2026-09-27, as were the fit checks' accepted boundary limit and the overlap rule's end-group limit.

---

## User Stories

### P1: Statuses read down one column ⭐ MVP

**User Story**: As a developer scanning changed files, I want every status glyph in one column at the right edge of the tree so that I read the statuses top to bottom without hunting.

**Why P1**: The request.

**Acceptance Criteria**:

1. WHEN a file row renders in the uncommitted or the diff-to-origin list THEN its status glyph SHALL be the row's last element, with its right edge within 1 px of the row's right edge minus the row's right padding
2. The file rows of one list SHALL show their glyphs at the same right edge, within 1 px, whatever each row's depth
3. The tree SHALL show exactly one status glyph per changed file row
4. WHEN a file name is wider than the space its row leaves THEN the name SHALL be cut with an ellipsis and the glyph SHALL keep the position of criteria 1 and 2
22. WHEN a file name fits the space its row leaves THEN the name SHALL show whole, with no ellipsis
5. The tree SHALL show no status glyph on the folder rows of the changed lists

**Independent Test**: In diff-to-origin and in uncommitted, every file row's glyph ends at the same x, the long untracked name included; every name that fits its row shows whole.

---

### P1: The glyph tells the status ⭐ MVP

**User Story**: As a developer, I want an added file marked with a `+`, untracked files kept as a grey `U`, and a tooltip naming the status so that each glyph reads at a glance and never alone.

**Why P1**: The request.

**Acceptance Criteria**:

6. WHEN a file's status is added THEN its glyph SHALL read `+` in the green tone
7. WHEN a file's status is modified THEN its glyph SHALL read `M` in the amber tone
8. WHEN a file's status is deleted THEN its glyph SHALL read `D` in the red tone
9. WHEN a file's status is renamed THEN its glyph SHALL read `R` in the accent tone
10. WHEN a file's status is untracked THEN its glyph SHALL read `U` in the muted text tone
11. The glyph SHALL carry a tooltip naming its status: `Added`, `Modified`, `Deleted`, `Renamed` or `Untracked`
12. The tree rows and the section headers SHALL take glyph, tooltip and tone from one shared mapping, and neither component SHALL keep its own status letter or label map

**Independent Test**: `changeStatusView` answers the five statuses with the glyphs and labels above; the running app shows them with the tones above.

---

### P1: A deleted file reads as gone ⭐ MVP

**User Story**: As a developer, I want a deleted file's name struck through so that I see it is gone before reading its glyph.

**Why P1**: The request.

**Acceptance Criteria**:

13. WHEN a deleted file's row renders THEN its name SHALL be struck through
14. The strikethrough SHALL cover the name text only: the row, its icon and its glyph SHALL NOT be struck
15. WHEN a row of any other status renders THEN its name SHALL NOT be struck through

**Independent Test**: In diff-to-origin, `removed.md` is the only struck text in the tree, and within its row only the name is struck.

---

### P1: Section headers read like the tree ⭐ MVP

**User Story**: As a developer, I want the All changes and commit section headers to end with the same glyph, aligned across sections, so that the tree and the diff read alike.

**Why P1**: The request.

**Acceptance Criteria**:

16. WHEN an All changes section header renders THEN its status glyph SHALL be its last element, after the counts, with its right edge within 1 px of the header's right edge minus its right padding
17. The headers of one stack SHALL show their glyphs at the same right edge, within 1 px, including headers that show no counts (a binary or too-large file)
18. The section header SHALL show exactly one status glyph, and no status element before the path
19. WHEN the section's file is deleted THEN its path SHALL be struck through, and the header, chevron, counts and glyph SHALL NOT be struck
20. WHEN a path is wider than the space its header leaves THEN the path SHALL be cut with an ellipsis and the glyph SHALL keep the position of criteria 16 and 17
23. WHEN a path fits the space its header leaves THEN the path SHALL show whole, with no ellipsis
21. WHERE the stack belongs to a commit tab, its headers SHALL follow criteria 16 to 20

**Independent Test**: In both stacks, every header's glyph ends at the same x, the binary file's header without counts included; `docs/removed.md` is the only struck path; every path that fits its header shows whole.

---

## Edge Cases

- WHEN a list mixes rows at depth 0 and depth 1 (uncommitted: `crlf.txt`, `untracked.txt` beside `src/…` and `assets/logo.bin`) THEN criterion 2 SHALL hold across depths (smoke check, T9)
- WHEN a header shows no counts because its file is binary THEN criterion 17 SHALL hold for it (smoke check, T10)
- WHEN a status is shown in the uncommitted list THEN the same glyph, tooltip and tone SHALL show as in diff-to-origin (both lists read the one mapping; smoke checks the U row in uncommitted and M in both, T9)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FSTS-01 | P1: one column — AC 1 | Execute | Verified (validation.md round 4) |
| FSTS-02 | P1: one column — AC 2 | Execute | Verified (validation.md round 4) |
| FSTS-03 | P1: one column — AC 3 | Execute | Verified (validation.md round 4) |
| FSTS-04 | P1: one column — AC 4 | Execute | Verified with Fix 10's limit accepted by the owner 2026-09-27 (validation.md round 4). T18 closed V1 and V4 (both fail 3, 4 and 5), but W4 (the glyph pulled 12 px out of its end group) draws the glyph 6 px over the name and passes every check |
| FSTS-05 | P1: one column — AC 5 | Execute | Verified (validation.md round 4) |
| FSTS-06 | P1: glyph — AC 6 | Execute | Verified (validation.md round 4) |
| FSTS-07 | P1: glyph — AC 7 | Execute | Verified (validation.md round 4) |
| FSTS-08 | P1: glyph — AC 8 | Execute | Verified (validation.md round 4) |
| FSTS-09 | P1: glyph — AC 9 | Execute | Verified (validation.md round 4) |
| FSTS-10 | P1: glyph — AC 10 | Execute | Verified (validation.md round 4) |
| FSTS-11 | P1: glyph — AC 11 | Execute | Verified (validation.md round 4) |
| FSTS-12 | P1: glyph — AC 12 | Execute | Verified (validation.md round 4) |
| FSTS-13 | P1: deleted — AC 13 | Execute | Verified (validation.md round 4) |
| FSTS-14 | P1: deleted — AC 14 | Execute | Verified (validation.md round 4) |
| FSTS-15 | P1: deleted — AC 15 | Execute | Verified (validation.md round 4) |
| FSTS-16 | P1: headers — AC 16 | Execute | Verified with Fix 10's limit accepted by the owner 2026-09-27 (validation.md round 4). T18 closed V4h (it fails 11, 12, 14, 18 and 19), but W4h draws the glyph 4 px over the counts and passes every check |
| FSTS-17 | P1: headers — AC 17 | Execute | Verified (validation.md round 4) |
| FSTS-18 | P1: headers — AC 18 | Execute | Verified (validation.md round 4) |
| FSTS-19 | P1: headers — AC 19 | Execute | Verified (validation.md round 4) |
| FSTS-20 | P1: headers — AC 20 | Execute | Verified (validation.md round 4): V1h and a 1 px overlap (W1h) fail 11, 12, 14, 18 and 19 |
| FSTS-21 | P1: headers — AC 21 | Execute | Commit-specific clauses verified (validation.md round 4: T-b, W7 and W8 fail 18; V1h and V4h fail 18 and 19); inherits FSTS-16's accepted Fix 10 limit (owner 2026-09-27) |
| FSTS-22 | P1: one column — AC 22 | Execute | Verified (validation.md round 4), with Fix 8's boundary limit accepted by the owner (V6, a 120 px cap, survives) |
| FSTS-23 | P1: headers — AC 23 | Execute | Verified (validation.md round 4), with Fix 8's boundary limit accepted by the owner (V6h, a 700 px cap, survives) |

**Coverage:** 23 total, 23 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] On a branch with dozens of changed files, the owner reads every status down one column without moving the eye sideways
- [ ] A deleted or added file is recognised before its glyph is read
