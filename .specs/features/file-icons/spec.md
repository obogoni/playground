# File Icons Specification

## Problem Statement

Every file in the Files direction wears the same generic `file` icon, and folders wear none — only
a chevron. In a .NET solution next to a front-end project, a `.cs`, a `.xaml`, a `.csproj` and a
`.tsx` look identical until their names are read, which is what VS Code and Visual Studio users
never have to do. The changed-files list and the tab strip show no file icon at all.

## Goals

- [ ] A file's icon tells its language or role at a glance, as in VS Code with the vscode-icons theme
- [ ] Well-known folders (`src`, `test`, `.git`, `.github`, `node_modules`, `bin`, `obj`, `wwwroot`, …) are recognisable
- [ ] Every Visual Studio 2026 solution and project file has a specific icon, `.slnx` included

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| A choice of icon themes in Settings | Owner chose one theme (grill Q1, comparison page of 2026-09-22) |
| Icons in the All changes section headers | Not among the owner's places (grill Q2) |
| Generating the mapping from the vscode-icons repository | Owner decision (grill Q4): the packaged mapping plus our own corrections |
| Icons for folders vscode-icons does not cover (`Properties`, `Migrations`, …) | The theme has none; they keep the generic folder, as in VS Code |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Icon set | vscode-icons, from `@iconify-json/vscode-icons` (MIT) | Owner decision (grill Q1), after the side-by-side comparison page | y |
| Mapping | `vscode-icons-js` (MIT, last released 2023-05) queried with the **lower-cased** name, then our corrections table applied on top | Owner decision (grill Q4). Measured: the package matches names case-sensitively (`Dockerfile` misses, `dockerfile` hits) | y |
| Initial corrections | `.slnx` → the `.sln` icon; `.razor` → `file-type-razor`; `.resx` → the XML icon | Owner asked for `.slnx` (comparison page); `.razor` has an icon the old mapping does not use; `.resx` is an XML resource and the theme has no icon for it | y |
| Icon names missing from the set | A mapped name absent from the Iconify set tries its `2` variant (`file-type-pdf` → `file-type-pdf2`), then falls back to the generic icon | Measured on the comparison page | y |
| Light theme | In the app's light theme, a `file-type-light-<x>` / `folder-type-light-<x>` variant replaces `<x>` when the set has one | Owner decision (grill Q5); 172 light variants measured | y |
| Dark theme | The mapping answers some names with a light variant (`.json`, `.js`, `.yml`, `.rs`, `.env`, `node_modules`); in the dark theme that answer is replaced by its base icon when the set has it | Owner decision 2026-09-26, at Execute: the light variants are drawn for a light background (`.json` `#fbc02d` against the base `#f5de19`) and 11 of the 91 sample names were getting them in the app's default theme | y |
| Where | File rows of the Explore tree; file and folder rows of the changed-files list (both diff modes); every file and diff tab | Owner decision (grill Q2) | y |
| Folders | Open and closed folder icons, with the theme's special folders when it has them; the generic pair otherwise | Owner decision (grill Q3) | y |
| Loading | The icon set is a separate, lazily imported chunk loaded the first time the Files direction renders; until it arrives, rows show today's generic icon | ~3.7 MB of icon data must not weigh on the app's start | y |
| Rendering | Each icon is an `<img>` with a `data:` SVG URI, 16 px, `alt=""` (the name beside it carries the meaning) | Inline SVGs from one set share gradient ids and collide on a page; an image isolates each | y |
| Attribution | The MIT notices of vscode-icons, `@iconify-json/vscode-icons` and `vscode-icons-js` added to the repository's third-party notices | MIT asks for it; the repository is public | y |
| Base branch | `feature/file-icons` off `feature/files-diff` `bf2fc7e`, a sibling of `feature/files-view-polish` (M1); rebased onto `origin/main` `c31bb9a` on 2026-09-26, once the Files epic merged | Owner decision (grill Q6); a small conflict in the tab label with M1 (PR #125) is resolved once, by whichever merges second | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Files show what they are ⭐ MVP

**User Story**: As the owner browsing a worktree, I want each file's icon to show its language or role so that I find files by sight.

**Why P1**: The request.

**Acceptance Criteria**:

1. WHEN a file row, changed-file row or tab renders THEN it SHALL show the vscode-icons icon its lower-cased name maps to, after our corrections
2. WHEN a name maps to nothing THEN the row SHALL show vscode-icons' default file icon
3. WHEN the file is `*.slnx` THEN it SHALL show the same icon as `*.sln`
4. WHEN the file is `*.razor` THEN it SHALL show `file-type-razor`
5. WHEN the file is `*.resx` THEN it SHALL show the XML icon
6. WHEN a mapped icon name is absent from the set THEN its `2` variant SHALL be used when present, else the default file icon
7. WHILE the app's theme is light, an icon with a light variant SHALL show the light variant
8. WHEN the theme changes THEN every visible icon SHALL follow without a restart
15. WHILE the app's theme is dark, a light variant answered by the mapping SHALL be replaced by its base icon when the set has one

**Independent Test**: The comparison page's 91 sample paths resolve to the icons it shows, `.slnx`, `.razor` and `.resx` included.

---

### P1: Folders show what they are ⭐ MVP

**User Story**: As the owner, I want well-known folders to have their own icons so that the tree reads like my editor's.

**Why P1**: The request.

**Acceptance Criteria**:

9. WHEN a folder row renders collapsed THEN it SHALL show the theme's closed icon for its lower-cased name, else the default closed folder
10. WHEN a folder row renders expanded THEN it SHALL show the matching opened icon
11. WHEN a folder in the changed-files list renders THEN it SHALL follow criteria 9 and 10

**Independent Test**: `src`, `.github` and `node_modules` show their own icons; `Properties` shows the default folder.

---

### P1: Icons never slow the app down ⭐ MVP

**User Story**: As the owner, I want the app to start as fast as before so that icons cost nothing until I look at files.

**Why P1**: The set is several megabytes.

**Acceptance Criteria**:

12. The icon set SHALL be emitted as its own chunk and SHALL NOT be imported by the renderer's entry chunk
13. WHILE the set is loading, rows SHALL show the generic `file` icon they show today
14. IF the chunk fails to load THEN rows SHALL keep the generic icon and the failure SHALL be logged once

---

## Edge Cases

- WHEN a name has several dots (`OrderList.test.tsx`, `appsettings.Development.json`) THEN the mapping SHALL be the package's own rule for it, then our corrections by the last extension
- WHEN a file has no extension (`LICENSE`, `Makefile`, `Dockerfile`) THEN the whole lower-cased name SHALL be looked up
- WHEN a name contains characters outside ASCII THEN it SHALL be lower-cased with the locale-independent rule
- WHEN an icon name only contains `light` inside a word (`file-type-go-lightblue`, `file-type-lighthouse`) THEN it SHALL NOT be treated as a light variant

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FICN-01 | P1: files — AC 1 | Execute | Verified |
| FICN-02 | P1: files — AC 2 | Execute | Verified |
| FICN-03 | P1: files — AC 3 | Execute | Verified |
| FICN-04 | P1: files — AC 4 | Execute | Verified |
| FICN-05 | P1: files — AC 5 | Execute | Verified |
| FICN-06 | P1: files — AC 6 | Execute | Verified |
| FICN-07 | P1: files — AC 7 | Execute | Verified |
| FICN-08 | P1: files — AC 8 | Execute | Verified |
| FICN-09 | P1: folders — AC 9 | Execute | Verified |
| FICN-10 | P1: folders — AC 10 | Execute | Verified |
| FICN-11 | P1: folders — AC 11 | Execute | Verified |
| FICN-12 | P1: no slowdown — AC 12 | Execute | Verified |
| FICN-13 | P1: no slowdown — AC 13 | Execute | Verified |
| FICN-14 | P1: no slowdown — AC 14 | Execute | Verified |
| FICN-15 | P1: files — AC 15 | Execute | Verified |

**Coverage:** 15 total, 15 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [ ] The owner's own solution reads by icon in the Files tree, the changed list and the tabs
- [ ] App start time and the entry chunk's size unchanged
