# Files Direction — Azure DevOps Pull Requests (F4) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-pr-ado/design.md`
**Status**: Draft

**Branch**: `feature/files-pr-ado`, stacked on `feature/files-commits`. Once F3 merges, `git rebase --onto origin/main feature/files-commits feature/files-pr-ado`.

**Prerequisites**: F3 executed (`parseRemote`, the main-built opener); F2 executed (`DiffViewer`).

**Test baseline**: **945** — F3's projected end, resting on a chain of projections back to `origin/main`'s recorded 748. **Re-measure with `npm test` as the first act of Execute.**

**Baseline measured 2026-09-19** with `npx vitest run` on `origin/main` `6ecd19c`, after the upstream merged #88: **917 tests / 52 files**, all passing. The 748 the plans started from was recorded before #88 and is stale by **+169**. Its baseline becomes **1114**; every count below shifts by **+169** and this feature ends at **1184** (**1188** if T25 is kept), not 1015 / 1019. Still re-measure as the first act of Execute.

**Outward writes**: T1 writes to Azure DevOps. It runs **only on a sandbox PR the owner names, with the owner's explicit go-ahead given at that moment** — approving these tasks does not authorize it. No other task sends a write request to a real Azure DevOps organization; every client test uses a fake `fetch`.

**Privacy guardrail**: fixtures, tests, findings and the smoke use fictitious names only (`acme`, `platform`, `widget`). The spike records conventions and field shapes, never real content, identities or ids.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process DI client (`ado-pr.ts`) | unit (fake `fetch`) | The exact URL and body of every read and write; paging to the end; **no write request on any read path** | `src/main/ado-pr.test.ts` | `npm test` |
| Pure main modules (`ado-pr-model.ts`, `link-guard.ts`, `remote-url.ts` additions) | unit | 1:1 to the ACs each decides; doc-shaped fixtures; every rejection case | co-located `*.test.ts` | `npm test` |
| Security-critical renderer helper (`markdown.ts`) | unit (Node) | Every injection vector in the design renders inert | `src/renderer/src/lib/markdown.test.ts` | `npm test` |
| Pure renderer helpers (`pr-view.ts`, `diff-view.ts` extension) | unit | Input→output per AC | co-located `*.test.ts` | `npm test` |
| Gateway source hygiene (`ado-gateway.ts`) | unit | No control byte other than tab, LF, CR in the file | `src/main/ado-gateway.test.ts` | `npm test` |
| Shared types, IPC contract | none | build gate only | — | `npm run typecheck` |
| Thin Electron shell (`index.ts`) | none (hand-verified) | — | `src/main/index.ts` | `npm run typecheck` |
| Renderer components and hook | none (CDP smoke + visual) | — | — | `node scripts/smoke-files-pr-ado.mjs` |
| Docs (README, STATE) | none | — | — | review |
| Spike findings | manual | Each **[spike]** item in the design measured | `design.md` § Spike Findings | by hand |
| Out-of-CI smoke | manual only | Every AC no unit test reaches | `scripts/smoke-*.mjs` | `node scripts/smoke-files-pr-ado.mjs` (live session, sandbox PR) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a logic-bearing, contract, dependency or renderer task | `npm run typecheck && npm run lint && npm test` |
| Build | At each phase boundary | `npx electron-vite build` |
| Manual | T1 and T27 | by hand / `node scripts/smoke-files-pr-ado.mjs` |

**Lint is judged by exit code AND by warning count** — record the count at T2 and diff it at every gate.

---

## Execution Plan

### Phase 1: Measure the API on a sandbox

```
T1
```

**Stop point, and an owner-gated one.** T1 needs the owner's sandbox PR and go-ahead. Its findings may change the design; if they do, the design is amended in T1's commit and later phases are re-checked before T2.

### Phase 2: Pure foundations

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 3: The client and its wiring

```
T8 → T9 → T10 → T11
```

### Phase 4: Renderer decisions

```
T11 → T12 → T13 → T14 → T15
```

### Phase 5: The Pull request mode

```
T15 → T16 → T17 → T18 → T19 → T20 → T21 → T22 → T23 → T24
```

### Phase 6: Close the loop

```
T24 → T25 → T26 → T27
```

---

## Task Breakdown

### T1: Measure what the reference left open

**What**: On a sandbox PR the owner names, with the owner's go-ahead at that moment, measure the five **[spike]** items and record them in `design.md` under **Spike Findings**, using fictitious names only.
**Where**: `.specs/features/files-pr-ado/design.md`
**Depends on**: None
**Reuses**: The gateway's token path; plain `fetch` in a scratch script outside the repository.
**Requirement**: FPRA-16, 18, 19, 27

**Tools**: MCP: NONE · Skill: NONE — the Azure DevOps MCP servers connected to this session are **not** used: they reach the company organization, and this repository is public

**Done when**:

- [ ] **Offset convention**: a thread created in ADO's own UI on a known span, read back — recorded whether a line start is `offset` 0 or 1
- [ ] **Iteration context**: the same thread's `iterationContext` in the whole-PR view — recorded whether it is `{ first: n, second: n }`
- [ ] **Outdated signal**: after one more push to the sandbox branch, recorded what `threads?$iteration=<latest>&$baseIteration=0` returns for a thread whose line changed versus one whose line did not
- [ ] **`<…>` in comments**: a probe comment containing `` `List<string>` `` and `a <b> c`, read back — recorded whether ADO kept, escaped or deleted it
- [ ] **Reading a file**: the item / blob calls that give size before content, and the field names; the create-PR URL parameters
- [ ] Every probe comment and thread created on the sandbox is deleted afterwards
- [ ] No real org, project, repository, identity or content appears in the findings
- [ ] If any finding contradicts the design, the design is amended in this commit; **if `<…>` is altered**, `spec.md` gains FPRA-37 (the composer warns before posting content ADO would alter) and T25 is kept — otherwise T25 is removed with a note

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the azure devops pull request spike findings`

---

### T2: Share the ADO token and make the gateway searchable

**What**: Export the gateway's token acquisition as `getAdoToken()` and replace the raw NUL composite-key separator at `ado-gateway.ts:280` with the `\u0000` escape.
**Where**: `src/main/ado-gateway.ts`
**Depends on**: T1
**Reuses**: The existing token code and its tests, which must pass unedited.
**Requirement**: FPRA-07, 36

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A new test reads the source file's bytes and asserts no control byte other than tab, LF and CR
- [ ] `refKey` produces the same keys as before (existing tests unedited)
- [ ] `grep -c refKey src/main/ado-gateway.ts` prints a count, not "Binary file matches"
- [ ] Lint warning baseline recorded in the commit body
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 945 + 1 = **946**

**Tests**: unit
**Gate**: full
**Commit**: `refactor(main): share the ado token and drop the raw nul byte`

---

### T3: Declare the pull request contract

**What**: Add `'pull-request'` to `FilesMode` and the PR types of the design to `src/shared/files.ts`; register the `ado-pr:*` channels.
**Where**: `src/shared/files.ts`
**Depends on**: T2
**Reuses**: F1 / F2 types; `LaunchResult`.
**Requirement**: FPRA-01, 02, 09, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Write channels carry intent only — no URL, token or raw ADO body crosses IPC
- [ ] **[amended at F5 Spec]** The model is provider-neutral as the design's amendment describes: `provider` on `PrSummary`, `resolution` + `providerStatus` on threads, neutral reviewer `state` — so F5 adds a provider, not a second model
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **946** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the pull request contract`

---

### T4: Allow only https links

**What**: Create `src/main/link-guard.ts` with the pure `isOpenableLink(href)`.
**Where**: `src/main/link-guard.ts`
**Depends on**: T3
**Reuses**: Nothing — new pure logic.
**Requirement**: FPRA-23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] True for `https://example.com/x`
- [ ] False for `javascript:alert(1)`, `JaVaScRiPt:…`, `data:text/html,…`, `file:///C:/x`, `http://…`, a relative path and a malformed URL
- [ ] `link-guard.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 946 + 7 = **953**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): allow only https links to leave the app`

---

### T5: Build PR page URLs

**What**: Add `prUrl(ref, id)` and `createPrUrl(ref, branch)` to F3's `remote-url.ts`, using the create-PR parameters T1 confirmed, or the repository's PR list page if T1 could not confirm them.
**Where**: `src/main/remote-url.ts`
**Depends on**: T4
**Reuses**: F3's `RemoteRef` and encoding helpers.
**Requirement**: FPRA-05, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `prUrl` → `https://dev.azure.com/acme/platform/_git/widget/pullrequest/42`
- [ ] `createPrUrl` encodes a branch with `/` correctly
- [ ] A project with a space round-trips
- [ ] Every output passes `isOpenableLink`
- [ ] Gate passes: `npm test`
- [ ] Test count: 953 + 4 = **957**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): build azure devops pull request urls`

---

### T6: Map PR files, votes and remotes

**What**: Create `src/main/ado-pr-model.ts` with `toChangedPaths`, `voteLabel`, `pickRemoteRepos` and `sourceRemote`.
**Where**: `src/main/ado-pr-model.ts`
**Depends on**: T5
**Reuses**: F1's `ChangeStatus`; F3's `parseRemote`.
**Requirement**: FPRA-02, 06, 09, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `add / edit / delete / rename` map to `ChangeStatus`; the leading `/` is stripped; `originalPath` and `changeTrackingId` survive
- [ ] The five documented votes map to their labels; an unknown value maps to "no vote"
- [ ] A repository with a GitHub `origin` and an ADO `fork` yields one ADO target; no ADO remote yields none (FPRA-06)
- [ ] `ado-pr-model.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 957 + 7 = **964**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): map pull request files, votes and remotes`

---

### T7: Decide where each thread goes

**What**: Add `classifyThread`, `visibleComments` and `isMarkdown` to `ado-pr-model.ts`, with the outdated rule T1 confirmed.
**Where**: `src/main/ado-pr-model.ts`
**Depends on**: T6
**Reuses**: The thread shapes from the reference's List example (fictitious names).
**Requirement**: FPRA-11, 13, 18, 19, 20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `commentType: system` and a `CodeReviewThreadType` property each classify as `system`
- [ ] A thread with no `threadContext` is `general`
- [ ] Right-anchored → placed right; left-only → placed left
- [ ] A thread not tracked to the latest iteration (per T1) is `outdated`
- [ ] A deleted thread, and a thread whose every comment is deleted, are `deleted`
- [ ] `visibleComments` drops deleted comments; `isMarkdown` reads the `SupportsMarkdown` property
- [ ] Gate passes: `npm test`
- [ ] Test count: 964 + 9 = **973**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): decide where each pull request thread goes`

---

### T8: Turn a selection into an ADO anchor

**What**: Add `anchorFromSelection(selection, convention)` and `iterationContextFor(latest)` to `ado-pr-model.ts`, with the offset convention and iteration context T1 recorded.
**Where**: `src/main/ado-pr-model.ts`
**Depends on**: T7
**Reuses**: Monaco's 1-based selection shape.
**Requirement**: FPRA-27

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] A selection from line 5 column 1 to line 6 column 13 converts under both conventions, each asserted
- [ ] The convention constant is the one T1 recorded, with the finding cited in a comment
- [ ] A selection made bottom-up is normalized to start ≤ end
- [ ] `iterationContextFor(4)` returns what T1 recorded
- [ ] Gate passes: `npm test`
- [ ] Test count: 973 + 5 = **978**
- [ ] Phase gate passes: `npx electron-vite build`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): turn a diff selection into an azure devops anchor`

---

### T9: Read a pull request

**What**: Create `src/main/ado-pr.ts` with `AdoPrClient({ getToken, fetchFn })` and its read methods — `findPrs`, `getPr`, `latestIteration`, `changedFiles`, `threads`, `fileSide`.
**Where**: `src/main/ado-pr.ts`
**Depends on**: T8
**Reuses**: `getAdoToken`, `fetchWithTimeout`; the model from T6–T8; the `TaskBoard` DI test style.
**Requirement**: FPRA-02, 03, 04, 05, 06, 07, 09, 15, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `findPrs` sends `sourceRefName=refs/heads/<branch>`, `sourceRepositoryId=<source id>` and `status=active` to **each** ADO target
- [ ] `getPr` is used for the Overview, so a 1000-character description arrives whole (the list truncates to 400)
- [ ] `changedFiles` follows `nextSkip` / `nextTop` until both are 0 — a 250-file fixture yields 250 files
- [ ] `threads` sends `$iteration=<latest>&$baseIteration=0`
- [ ] `fileSide` never requests content above 1 MB or for a binary
- [ ] A missing token yields the auth result; a timeout yields an error result; nothing throws
- [ ] **No read method issues a POST, PATCH, PUT or DELETE** — asserted over every read test
- [ ] `ado-pr.test.ts` created
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 978 + 10 = **988**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): read azure devops pull requests`

---

### T10: Write review comments

**What**: Add `reply`, `setStatus`, `createThread` and `generalComment` to `AdoPrClient`.
**Where**: `src/main/ado-pr.ts`
**Depends on**: T9
**Reuses**: The anchor and iteration context from T8; `changeTrackingId` from `changedFiles`.
**Requirement**: FPRA-25, 26, 27, 29, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Each write sends exactly the URL and body in the design (reply `parentCommentId` = the thread's root comment)
- [ ] `createThread` carries `filePath` with a leading `/`, the anchor, `changeTrackingId` and the iteration context
- [ ] A 401 / 403 returns `{ ok: false, message }` with ADO's message
- [ ] Each write method issues exactly one request, and only when called
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 988 + 6 = **994**

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): write azure devops review comments`

---

### T11: Serve the pull request channels

**What**: Register the `ado-pr:*` handlers in `index.ts`; `ado-pr:open` and `ado-pr:open-link` re-check `isOpenableLink` before `shell.openExternal`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: `handle()`; F3's opener pattern.
**Requirement**: FPRA-05, 14, 23, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Every handler is a delegation; `shell.openExternal` is reached only after `isOpenableLink`
- [ ] Nothing new goes through the template's `setWindowOpenHandler`
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **994** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the pull request channels`

---

### T12: Render third-party markdown inertly

**What**: Add `markdown-it` (+ types) and create `src/renderer/src/lib/markdown.ts` with `renderMarkdown(source, { markdown })` — `html: false`, links as `data-href` with no `href`, images as links, plain escaped text when `markdown` is false.
**Where**: `src/renderer/src/lib/markdown.ts`
**Depends on**: T11
**Reuses**: Nothing — new, security-critical, fully unit-tested.
**Requirement**: FPRA-10, 21, 22, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `<script>alert(1)</script>` renders as escaped text
- [ ] `<img src=x onerror=alert(1)>` renders as escaped text
- [ ] `[x](javascript:alert(1))` renders with no `href` and no `data-href`
- [ ] `[x](https://example.com)` renders with `data-href` and no `href`
- [ ] `![alt](https://example.com/a.png)` renders as a link, never an `<img>`
- [ ] An HTML comment and a `<details>` block render as escaped text
- [ ] `markdown: false` escapes the whole source
- [ ] No output anywhere contains ` on` event attributes or an `href` attribute
- [ ] `markdown-it` added to `dependencies`, version pinned
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 994 + 9 = **1003**

**Tests**: unit
**Gate**: full
**Commit**: `feat(renderer): render third-party markdown inertly`

---

### T13: Group threads for the Overview

**What**: Create `src/renderer/src/lib/pr-view.ts` with `overviewGroups(threads)` and `statusLabel(status)`.
**Where**: `src/renderer/src/lib/pr-view.ts`
**Depends on**: T12
**Reuses**: `PrThreadView`.
**Requirement**: FPRA-11, 13, 19, 20, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Active, resolved, outdated, general and activity groups each receive exactly their threads; deleted threads appear nowhere
- [ ] Every ADO status has a label; the statuses offered for a change exclude `unknown`
- [ ] `pr-view.test.ts` created
- [ ] Gate passes: `npm test`
- [ ] Test count: 1003 + 5 = **1008**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): group pull request threads for the overview`

---

### T14: Place threads in a diff and detect a new iteration

**What**: Add `zonesForFile(threads, path)` and `newIterationBanner(onScreen, latest)` to `pr-view.ts`.
**Where**: `src/renderer/src/lib/pr-view.ts`
**Depends on**: T13
**Reuses**: `PrThreadView.place`.
**Requirement**: FPRA-18, 34

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Threads for other files are excluded; left and right placements go to their sides; zones sit after the thread's end line
- [ ] Two threads on the same line produce two zones in publication order
- [ ] The banner shows only when the latest iteration is newer than the one on screen
- [ ] Gate passes: `npm test`
- [ ] Test count: 1008 + 5 = **1013**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): place threads in a diff and detect new iterations`

---

### T15: Key the pull request tabs

**What**: Extend F2's `tabKeyOf` for `pr-overview` and `pr:<id>:<path>` tabs.
**Where**: `src/renderer/src/lib/diff-view.ts`
**Depends on**: T14
**Reuses**: F2 / F3 tab identity and tests, unedited.
**Requirement**: FPRA-09, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] PR tabs never collide with file, diff, commit or All changes tabs
- [ ] Pre-existing tab tests pass unedited
- [ ] Gate passes: `npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: 1013 + 2 = **1015**

**Tests**: unit
**Gate**: quick
**Commit**: `feat(renderer): key pull request tabs`

---

### T16: Let the diff viewer carry threads and selections

**What**: Add optional `zones` and `onSelectModified` props to F2's `DiffViewer` — Monaco view zones per side, and a callback with the modified-side selection.
**Where**: `src/renderer/src/components/DiffViewer.tsx`
**Depends on**: T15
**Reuses**: F2's `DiffViewer`.
**Requirement**: FPRA-18, 27, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Without the props, F2 and F3 behave exactly as before (checked in their tabs)
- [ ] `onSelectModified` never fires for a selection on the original side
- [ ] Zones resize with their content and are removed on unmount
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): let the diff viewer carry threads and selections`

---

### T17: Hold pull request state

**What**: Create `src/renderer/src/lib/use-pull-request.ts` — search, the chosen PR per worktree in memory, detail, reload on entry, on focus (5 s debounce), after each write and on a refresh button, and the new-iteration banner.
**Where**: `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T16
**Reuses**: F1 hook shape; `App.tsx:165` debounce pattern; `newIterationBanner`.
**Requirement**: FPRA-04, 33, 34, 35

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] No timer triggers a request (FPRA-35)
- [ ] A write that succeeded followed by a failed reload keeps the written content with a notice (edge case)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): hold pull request state`

---

### T18: Write a comment

**What**: Create the `CommentComposer` component — Write / Preview via `renderMarkdown`, Ctrl+Enter posts, the text kept and the error inline on failure.
**Where**: `src/renderer/src/components/CommentComposer.tsx`
**Depends on**: T17
**Reuses**: `renderMarkdown`.
**Requirement**: FPRA-30, 31, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Nothing posts without Ctrl+Enter or the Post button
- [ ] A failed post leaves the text exactly as typed
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): compose a review comment`

---

### T19: Render a thread

**What**: Create the `PrThread` component — comments with author and relative date, collapsed when resolved, Reply via the composer, and a status selector.
**Where**: `src/renderer/src/components/PrThread.tsx`
**Depends on**: T18
**Reuses**: `renderMarkdown`, `statusLabel`, `CommentComposer`; link clicks go to `ado-pr:open-link`.
**Requirement**: FPRA-20, 21, 25, 26

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Setting Active on a resolved thread reopens and expands it
- [ ] A link click sends only the `data-href`; the component never navigates
- [ ] **[amended at F5 Spec]** The status control is chosen by the thread's provider — ADO's selector here — so F5 plugs in its Resolve / Reopen toggle without editing this component's structure
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a review thread`

---

### T20: Render the Overview

**What**: Create the `PrOverview` component — header, description, reviewers with votes, grouped threads, collapsed Activity, Open in browser, general comment, and the none / no-remote / auth / detached states.
**Where**: `src/renderer/src/components/PrOverview.tsx`
**Depends on**: T19
**Reuses**: `overviewGroups`, `PrThread`, `CommentComposer`; the Tasks pane's "run `az login`" wording.
**Requirement**: FPRA-05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 29

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Activating an anchored thread opens its file's PR diff at the line
- [ ] Activity is collapsed by default
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render the pull request overview`

---

### T21: Pick among several pull requests

**What**: Create the `PrPicker` component — number, title and target branch per PR.
**Where**: `src/renderer/src/components/PrPicker.tsx`
**Depends on**: T20
**Reuses**: The hook's per-worktree choice.
**Requirement**: FPRA-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Shown only when more than one PR is found
- [ ] The choice survives switching worktrees and back while the app runs
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): pick among several pull requests`

---

### T22: Render a PR diff with its threads

**What**: Create the `PrDiffTab` component — `DiffViewer` with the ADO-read sides, `zonesForFile` threads, and **Comment** on a modified-side selection opening the composer anchored to it.
**Where**: `src/renderer/src/components/PrDiffTab.tsx`
**Depends on**: T21
**Reuses**: `DiffViewer` (with T16's props), `PrThread`, `CommentComposer`, F1's placeholder.
**Requirement**: FPRA-16, 17, 18, 27, 28

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] F2's layout, whitespace, folding, navigation and EOL behaviour all apply
- [ ] No Comment action on the original side
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): render a pull request diff with its threads`

---

### T23: Add Pull request to the mode selector

**What**: Add the fifth option to `FileTree` and render the PR's file tree while it is active.
**Where**: `src/renderer/src/components/FileTree.tsx`
**Depends on**: T22
**Reuses**: F1's selector and `buildTree`.
**Requirement**: FPRA-01, 15

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Five options fit the left column at its minimum width
- [ ] The PR tree shows each file's status
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): add pull request to the files mode selector`

---

### T24: Show the Overview and PR diff tabs

**What**: In `FileTabs`, show the fixed Overview tab and PR diff tabs while in Pull request mode.
**Where**: `src/renderer/src/components/FileTabs.tsx`
**Depends on**: T23
**Reuses**: F1–F3 tab strip; `tabKeyOf`.
**Requirement**: FPRA-09, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Overview cannot be closed; PR diff tabs can
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Phase gate passes: `npx electron-vite build`
- [ ] Test count: **1015** (unchanged)

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): show the pull request tabs`

---

### T25: Warn before posting content ADO would alter — conditional on T1

**What**: **Only if T1 found that Azure DevOps alters `<…>` in comments**: add `wouldBeAltered(content)` to `pr-view.ts` reproducing what T1 measured, and a warning in `CommentComposer` before posting. **If T1 found no alteration, this task is removed** with a one-line note here.
**Where**: `src/renderer/src/lib/pr-view.ts`
**Depends on**: T24
**Reuses**: T1's finding; `CommentComposer`.
**Requirement**: FPRA-37 (exists only if T1 confirms)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `wouldBeAltered` flags exactly the patterns T1 saw altered — accented letters included, per the owner's notes on work-item fields — and nothing else
- [ ] The composer shows the warning and still lets the user post
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: 1015 + 4 = **1019** (or 1015 if removed)

**Tests**: unit
**Gate**: full
**Commit**: `feat(renderer): warn before posting content azure devops would alter`

---

### T26: Record the new write posture

**What**: Amend the README's "ADO integration is view-only" to state that the app writes PR comments on explicit user action only, and append the proposed AD to `.specs/STATE.md`.
**Where**: `README.md`
**Depends on**: T25
**Reuses**: The AD wording in `spec.md`.
**Requirement**: FPRA-32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] README no longer claims view-only, and names exactly the four writes
- [ ] `.specs/STATE.md` gains the AD with the next free number, checked against `develop` and `origin/main` for collisions (the AD-018 / AD-021 renumbering precedent)
- [ ] Gate passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: unchanged from T25

**Tests**: none
**Gate**: full
**Commit**: `docs: record that the app writes azure devops review comments`

---

### T27: Drive the Pull request mode end to end

**What**: Create `scripts/smoke-files-pr-ado.mjs` against the owner's sandbox PR — **read-only by default**; writes only with an explicit `--allow-writes` flag, deleting what it created.
**Where**: `scripts/smoke-files-pr-ado.mjs`
**Depends on**: T26
**Reuses**: F1–F3 smoke harness and teardown.
**Requirement**: FPRA-01..36 end to end; the sole evidence for 03, 08, 12, 17, 20, 28, 30, 33, 34

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Read checks: the fifth mode; the PR found; Overview contents; threads under their lines; resolved collapsed; Activity collapsed; a markdown comment with a `javascript:` link rendered inert; refresh and focus reload
- [ ] With `--allow-writes`: reply, status change, a thread from a two-line selection landing on those lines in ADO's web view, a general comment — each deleted afterwards
- [ ] Sandbox coordinates come from environment variables, never from the repository
- [ ] Numbered pass/fail line per check; all pass against a live dev app

**Tests**: manual
**Gate**: manual
**Commit**: `test(files): drive the azure devops pull request mode end to end`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

Phase 1:  T1   (owner-gated stop point)
Phase 2:  T2 → T3 → T4 → T5 → T6 → T7 → T8
Phase 3:  T9 → T10 → T11
Phase 4:  T12 → T13 → T14 → T15
Phase 5:  T16 → T17 → T18 → T19 → T20 → T21 → T22 → T23 → T24
Phase 6:  T25 → T26 → T27
```

Strictly sequential. **T1 runs inline with the owner**, before any batch. **Packing** (~7 per batch, whole phases): Phase 2 (7) = batch 1; Phases 3 + 4 (3 + 4) = batch 2; Phase 5 (9) = batch 3 — one tight chain of components, left whole; Phase 6 (3) = batch 4. 27 tasks > 8, so the sub-agent offer applies — offer-then-confirm.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 findings section | ✅ |
| T2 | 1 export + 1 byte fix in 1 file | ⚠️ cohesive — both are the "touch the gateway" task the owner chose (F4-Q8) |
| T3 | 1 types file + contract entries | ✅ |
| T4, T5 | 1–2 pure functions | ✅ |
| T6 | 4 small pure mappers | ⚠️ cohesive — all translate ADO shapes to app shapes |
| T7 | 3 small pure functions on one concept | ✅ |
| T8 | 2 pure functions | ✅ |
| T9 | 1 client, read methods | ⚠️ cohesive — one class, one side (reads) |
| T10 | 1 client, write methods | ✅ |
| T11 | 1 wiring file | ✅ |
| T12 | 1 module + its dependency | ✅ |
| T13, T14 | 2 pure functions each | ✅ |
| T15 | 1 extension | ✅ |
| T16–T24 | 1 component / hook each | ✅ |
| T25 | 1 function + 1 wiring (conditional) | ✅ |
| T26 | 1 doc + 1 decision row | ✅ |
| T27 | 1 script | ✅ |

---

## Diagram-Definition Cross-Check

| Task | Depends On | Diagram Shows | Status |
| ---- | ---------- | ------------- | ------ |
| T1 | None | phase head | ✅ |
| T2 | T1 | T1 → T2 (boundary) | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T6 | T6 → T7 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 (boundary) | ✅ |
| T10 | T9 | T9 → T10 | ✅ |
| T11 | T10 | T10 → T11 | ✅ |
| T12 | T11 | T11 → T12 (boundary) | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T14 | T14 → T15 | ✅ |
| T16 | T15 | T15 → T16 (boundary) | ✅ |
| T17 | T16 | T16 → T17 | ✅ |
| T18 | T17 | T17 → T18 | ✅ |
| T19 | T18 | T18 → T19 | ✅ |
| T20 | T19 | T19 → T20 | ✅ |
| T21 | T20 | T20 → T21 | ✅ |
| T22 | T21 | T21 → T22 | ✅ |
| T23 | T22 | T22 → T23 | ✅ |
| T24 | T23 | T23 → T24 | ✅ |
| T25 | T24 | T24 → T25 (boundary) | ✅ |
| T26 | T25 | T25 → T26 | ✅ |
| T27 | T26 | T26 → T27 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2 | Gateway source hygiene | unit | unit | ✅ |
| T3 | Shared types + contract | none | none | ✅ |
| T4–T8 | Pure main modules | unit | unit | ✅ |
| T9, T10 | DI client | unit | unit | ✅ |
| T11 | Thin Electron shell | none | none | ✅ |
| T12 | Security-critical renderer helper | unit | unit | ✅ |
| T13–T15 | Pure renderer helpers | unit | unit | ✅ |
| T16–T24 | Renderer components / hook | none | none | ✅ |
| T25 | Pure renderer helper | unit | unit | ✅ |
| T26 | Docs | none | none | ✅ |
| T27 | Smoke | manual only | manual | ✅ |

---

## Requirement Traceability

| AC | Tasks |
| -- | ----- |
| FPRA-01 | T3, T23, T27 |
| FPRA-02 | T3, T6, T9, T27 |
| FPRA-03 | T9, T27 |
| FPRA-04 | T9, T17, T21 |
| FPRA-05 | T5, T9, T11, T20 |
| FPRA-06 | T6, T9, T20 |
| FPRA-07 | T2, T9, T20 |
| FPRA-08 | T20, T27 |
| FPRA-09 | T3, T6, T9, T15, T20, T24 |
| FPRA-10 | T12, T20 |
| FPRA-11 | T7, T13, T20, T27 |
| FPRA-12 | T20, T27 |
| FPRA-13 | T7, T13, T20, T27 |
| FPRA-14 | T5, T11, T20 |
| FPRA-15 | T6, T9, T23 |
| FPRA-16 | T1, T9, T15, T22, T24 |
| FPRA-17 | T22, T27 |
| FPRA-18 | T1, T7, T14, T16, T22, T27 |
| FPRA-19 | T1, T7, T13 |
| FPRA-20 | T7, T13, T19, T27 |
| FPRA-21 | T7, T12, T19 |
| FPRA-22 | T12, T27 |
| FPRA-23 | T4, T11 |
| FPRA-24 | T12 |
| FPRA-25 | T3, T10, T19, T27 |
| FPRA-26 | T10, T13, T19, T27 |
| FPRA-27 | T1, T8, T10, T16, T22, T27 |
| FPRA-28 | T16, T22, T27 |
| FPRA-29 | T10, T20, T27 |
| FPRA-30 | T18, T27 |
| FPRA-31 | T10, T18 |
| FPRA-32 | T10, T11, T18, T26 |
| FPRA-33 | T17, T27 |
| FPRA-34 | T14, T17, T27 |
| FPRA-35 | T17 |
| FPRA-36 | T2 |

All 36 mapped; none unmapped. FPRA-37 exists only if T1 confirms it, and is then mapped to T25.
