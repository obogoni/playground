# ADO PR Deleted Files Specification

## Problem Statement

An Azure DevOps pull request that deletes at least one file does not open in
Pull request mode: `ado-pr:get` rejects with
`TypeError: Cannot read properties of null (reading 'startsWith')` and the
Overview shows only "The pull request could not be read from Azure DevOps."
Azure DevOps sends a deleted file's change entry with `item.path: null` and the
path in `originalPath`. `toChangedPaths` reads `item.path` unconditionally, so
one deleted file takes the whole pull request down (issue #179).

## Goals

- [ ] A pull request that deletes files opens, with every deleted file listed as deleted.
- [ ] A deleted file's diff opens with its original content and no modified side.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Thread contexts with a null `filePath` | Not observed: the same pull request's threads all carry `filePath`. |
| GitHub pull requests | GitHub's files API always names the file; the bug is ADO's wire shape. |
| Showing an entry that names no path at all | No path means nothing to list or diff; it is dropped, not drawn. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Which path a deleted file is listed under | `originalPath`, leading `/` stripped, as `path`; no `oldPath` | Matches how Uncommitted mode lists a deletion; an `oldPath` would make it read as a rename. | n |
| Rule for picking the path | `item.path` when it is a string, else `originalPath` | Covers `delete` and combined types such as `delete, sourceRename` without enumerating change types. | n |
| `oldPath` for a rename | Unchanged: set from `originalPath` when `item.path` is a string | Renames already work; only the null-path branch changes. | y |
| An entry with neither `item.path` nor `originalPath` | Dropped from the file list; the rest of the PR opens | One unreadable entry must not fail the whole read (#179, Done when). | n |
| Where the modified side of a deleted file comes from | Existing `fileSides`: the modified read is a 404, already an absent side | No client change needed; covered by a client test. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Open a pull request that deletes files ⭐ MVP

**User Story**: As a reviewer, I want a pull request that deletes files to open
in Pull request mode so that I can review it like any other.

**Why P1**: Today such a pull request does not open at all.

**Acceptance Criteria**:

1. WHEN a change entry has `item.path: null` and `originalPath: "/src/old.ts"` THEN `toChangedPaths` SHALL list it with `path: "src/old.ts"`, `status: "deleted"` and no `oldPath`.
2. WHEN a change entry has `item.path` set THEN `toChangedPaths` SHALL list it under `item.path` and set `oldPath` from `originalPath` when present, as today.
3. WHEN `getPr` reads a pull request whose changes include an entry with `item.path: null` and `originalPath` set THEN it SHALL return `kind: "ok"` with that file listed as deleted.
4. WHEN `fileSides` reads a deleted file by its `originalPath` THEN it SHALL return the original side as text read at the merge-base commit and the modified side as `absent`.

**Independent Test**: Unit tests over `toChangedPaths` and `AdoPrClient.getPr` / `fileSides` with a stubbed fetch returning the wire shape from #179.

---

## Edge Cases

- IF a change entry has neither `item.path` nor `originalPath` THEN `toChangedPaths` SHALL leave it out of the list and keep every other entry.
- IF a change entry has `item.path: null` and a combined change type containing `delete` THEN `toChangedPaths` SHALL list it as `deleted` under `originalPath`.

---

## Requirement Traceability

| Requirement ID | Story | Phase   | Status  |
| -------------- | ----- | ------- | ------- |
| APDF-01        | P1    | Execute | Verified     |
| APDF-02        | P1    | Execute | Verified     |
| APDF-03        | P1    | Execute | Verified     |
| APDF-04        | P1    | Execute | Verified     |
| APDF-05        | Edge  | Execute | Verified     |
| APDF-06        | Edge  | Execute | Verified     |

APDF-01..04 are the P1 criteria in order; APDF-05 and APDF-06 are the two edge cases.

**Coverage:** 6 total.

---

## Success Criteria

- [ ] The pull request from #179 opens in Pull request mode with its deleted files listed.
- [ ] A unit test with the #179 wire shape fails on the current `toChangedPaths` and passes after the fix.
