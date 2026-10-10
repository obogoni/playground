# Files Direction — Azure DevOps Pull Requests (F4) Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/files-pr-ado/design.md`
**Status**: Draft

**Branch**: `feature/files-pr-ado`, off `main`. F2 and F3 merged upstream, so the plan commits were rebased with `git rebase --onto origin/main eec156e` on 2026-10-10 (onto `2e3307d`); the pre-rebase tip is kept as `backup/files-pr-ado-prerebase`.

**Prerequisites**: F3 executed (`parseRemote`, `openCommit`); F2 executed (`DiffViewer`). Both are on `main`.

**Test baseline**: **2977 tests / 132 files**, all passing, measured 2026-10-10 with `npx vitest run` on the rebased branch. Every count below rests on it.

**Reconciled with `main` on 2026-10-10** (see § Reconciliation at the end): the NUL byte and its test shipped with #122, the https-only helper is AD-044's `isHttpsUrl`, the Files mode is persisted per worktree, and the tab strip has pins and a fixed tab.

**Outward writes**: T1 writes to Azure DevOps. It runs **only on a sandbox PR the owner names, with the owner's explicit go-ahead given at that moment** — approving these tasks does not authorize it. The owner chose (2026-10-10) a PR in the Azure DevOps organization they work in; it should be a draft with no reviewers, on a throwaway branch, so the probes notify nobody else. No other task sends a write request to a real Azure DevOps organization; every client test uses a fake `fetch`.

**Privacy guardrail**: fixtures, tests, findings and the smoke use fictitious names only (`acme`, `platform`, `widget`). The spike records conventions and field shapes, never real content, identities or ids.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main-process DI client (`ado-pr.ts`) | unit (fake `fetch`) | The exact URL and body of every read and write; paging to the end; **no write request on any read path** | `src/main/ado-pr.test.ts` | `npm test` |
| Pure main modules (`ado-pr-model.ts`, `url-policy.ts` cases, `remote-url.ts` additions) | unit | 1:1 to the ACs each decides; doc-shaped fixtures; every rejection case | co-located `*.test.ts` | `npm test` |
| Security-critical renderer helper (`markdown.ts`) | unit (Node) | Every injection vector in the design renders inert | `src/renderer/src/lib/markdown.test.ts` | `npm test` |
| Pure renderer helpers (`pr-view.ts`, `diff-view.ts` extension) | unit | Input→output per AC | co-located `*.test.ts` | `npm test` |
| Gateway token sharing (`ado-gateway.ts`) | none (existing tests) | Visibility change only; the control-byte test shipped with #122 | `src/main/ado-gateway.test.ts` | `npm test` |
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
T24 → T26 → T27
```

---

## Task Breakdown

### T1: Measure what the reference left open

**What**: On a sandbox PR the owner names, with the owner's go-ahead at that moment, measure the five **[spike]** items and record them in `design.md` under **Spike Findings**, using fictitious names only.
**Where**: `.specs/features/files-pr-ado/design.md`
**Depends on**: None
**Reuses**: The gateway's token path; plain `fetch` in a scratch script outside the repository.
**Requirement**: FPRA-16, 18, 19, 27

**Tools**: MCP: NONE · Skill: NONE — the probes use plain `fetch` with the `az` token, the same calls the client will make, not the Azure DevOps MCP servers. The sandbox PR lives in the owner's employer organization (owner, 2026-10-10), and this repository is public: its coordinates come from environment variables and the scratch script lives outside the repository

**Done when**:

- [x] **Offset convention**: a thread created in ADO's own UI on a known span, read back — 1-based UTF-16 columns, end exclusive (S1)
- [x] **Iteration context**: the same thread's `iterationContext` in the whole-PR view — `{ first: n, second: n }` (S2)
- [x] **Outdated signal**: after one more push to the sandbox branch, recorded what `threads?$iteration=<latest>&$baseIteration=0` returns for a thread whose line changed versus one whose line did not — plus a second push deleting a commented line (S3)
- [x] **`<…>` in comments**: a probe comment containing `` `List<string>` `` and `a <b> c`, read back — kept byte-identical (S4)
- [x] **Reading a file**: the item / blob calls that give size before content, and the field names; the create-PR URL parameters (S6, S8)
- [x] Every probe comment created on the sandbox is deleted afterwards (Azure DevOps keeps a thread whose comments are all deleted, shown as deleted; that is the floor)
- [x] No real org, project, repository, identity or content appears in the findings
- [x] If any finding contradicts the design, the design is amended in this commit; **if `<…>` is altered**, `spec.md` gains FPRA-37 (the composer warns before posting content ADO would alter) and T25 is kept — otherwise T25 is removed with a note. **Amended**: the outdated rule (S3), markdown always (S5), file reads (S6), paging (S7); `<…>` not altered, so T25 is removed

**Tests**: manual
**Gate**: manual
**Commit**: `docs(specs): record the azure devops pull request spike findings`

---

### T2: Share the ADO token

**What**: Make `AdoGateway`'s cached token acquisition public, so `index.ts` can hand `() => gateway.getToken()` to the PR client — one cache and one `az` process for both. **[reconciled 2026-10-10]** The raw NUL byte was replaced by `\x00` in #122 (#117), which also added the control-byte test, so FPRA-36 is already met; the plan's free `getAdoToken()` is dropped because it would have started a second token cache.
**Where**: `src/main/ado-gateway.ts`
**Depends on**: T1
**Reuses**: The existing token code and its tests, which must pass unedited.
**Requirement**: FPRA-07 (FPRA-36 met by #122)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `getToken()` is public, with its result union unchanged; no second cache exists
- [x] Existing gateway tests pass unedited, the #122 control-byte test included
- [x] Lint warning baseline recorded in the commit body
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **2977** (unchanged — the control-byte test already exists, from #122)

**Tests**: none (visibility change only; covered by existing tests)
**Gate**: full
**Commit**: `refactor(main): share the azure devops token`

---

### T3: Declare the pull request contract

**What**: Add `'pull-request'` to `FilesMode` and the PR types of the design to `src/shared/files.ts`; register the `ado-pr:*` channels.
**Where**: `src/shared/files.ts`
**Depends on**: T2
**Reuses**: F1 / F2 types; `LaunchResult`.
**Requirement**: FPRA-01, 02, 09, 25

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Write channels carry intent only — no URL, token or raw ADO body crosses IPC
- [x] **[amended at F5 Spec]** The model is provider-neutral as the design's amendment describes: `provider` on `PrSummary`, `resolution` + `providerStatus` on threads, neutral reviewer `state` — so F5 adds a provider, not a second model
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **2977** (unchanged)

**Tests**: none
**Gate**: full
**Commit**: `feat(shared): declare the pull request contract`

---

### T4: Pin the https-only rule for third-party links

**What**: **[reconciled 2026-10-10]** AD-044 made `isHttpsUrl` in `src/main/url-policy.ts` the app's one https-only helper, so there is no `link-guard.ts`. This task adds the rejection cases FPRA-23 depends on to its tests; every later mention of `isOpenableLink` means `isHttpsUrl`.
**Where**: `src/main/url-policy.test.ts`
**Depends on**: T3
**Reuses**: `isHttpsUrl` (AD-044).
**Requirement**: FPRA-23

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] True for `https://example.com/x`
- [x] False for `javascript:alert(1)`, `JaVaScRiPt:…`, `data:text/html,…`, `file:///C:/x`, `http://…`, a relative path and a malformed URL
- [x] `url-policy.ts` itself unchanged unless a case fails; a failing case is a production fix in this task
- [x] Gate passes: `npm test`
- [x] Test count: 2977 + 7 = **2984** — **actual 2985**: the https case is a test of its own beside the seven refusals

**Tests**: unit
**Gate**: quick
**Commit**: `test(main): pin the https-only rule for third-party links`

---

### T5: Build PR page URLs

**What**: Add `prUrl(ref, id)` and `createPrUrl(ref, branch)` to F3's `remote-url.ts`; the create URL is `…/_git/{repo}/pullrequestcreate?sourceRef={branch}` (T1, S8).
**Where**: `src/main/remote-url.ts`
**Depends on**: T4
**Reuses**: F3's `RemoteRef` and encoding helpers.
**Requirement**: FPRA-05, 14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `prUrl` → `https://dev.azure.com/acme/platform/_git/widget/pullrequest/42`
- [x] `createPrUrl` encodes a branch with `/` correctly
- [x] A project with a space round-trips
- [x] Every output passes `isHttpsUrl`
- [x] Gate passes: `npm test`
- [x] Test count: 2984 + 4 = **2988** — **actual 2989** (2985 after T4, +4)

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

- [x] `add / edit / delete / rename` map to `ChangeStatus`; the leading `/` is stripped; `originalPath` and `changeTrackingId` survive
- [x] The five documented votes map to their labels; an unknown value maps to "no vote"
- [x] A repository with a GitHub `origin` and an ADO `fork` yields one ADO target; no ADO remote yields none (FPRA-06)
- [x] `ado-pr-model.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 2988 + 7 = **2995** — **actual 2997** (2989 after T5, +8: `sourceRemote` has two tests of its own)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): map pull request files, votes and remotes`

---

### T7: Decide where each thread goes

**What**: Add `classifyThread` and `visibleComments` to `ado-pr-model.ts`, with the outdated rule T1 measured (S3). `isMarkdown` is dropped (S5).
**Where**: `src/main/ado-pr-model.ts`
**Depends on**: T6
**Reuses**: The thread shapes from the reference's List example (fictitious names).
**Requirement**: FPRA-11, 13, 18, 19, 20, 21

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `commentType: system` and a `CodeReviewThreadType` property each classify as `system`
- [x] A thread with no `threadContext` is `general`
- [x] Right-anchored → placed right; left-only → placed left
- [x] A tracked thread whose current range is empty while its original was not is `outdated`; an untracked thread is placed at its own position; a tracked one at its current position (S3)
- [x] A deleted thread, and a thread whose every comment is deleted, are `deleted`
- [x] `visibleComments` drops deleted comments, which arrive without `content` (S9)
- [x] Gate passes: `npm test`
- [x] Test count: 2995 + 9 = **3004** — **actual 3006** (2997 after T6, +9)

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): decide where each pull request thread goes`

---

### T8: Turn a selection into an ADO anchor

**What**: Add `anchorFromSelection(selection)` and `iterationContextFor(latest)` to `ado-pr-model.ts`: Monaco's columns copied across (S1), `{ n, n }` (S2).
**Where**: `src/main/ado-pr-model.ts`
**Depends on**: T7
**Reuses**: Monaco's 1-based selection shape.
**Requirement**: FPRA-27

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] A selection from line 5 column 1 to line 6 column 13 becomes `{ 5, 1 }` → `{ 6, 13 }`
- [x] A selection after a two-byte character keeps character columns (S1's case: columns 34 → 39, never 35 → 40)
- [x] A selection made bottom-up is normalized to start ≤ end
- [x] `iterationContextFor(4)` returns `{ firstComparingIteration: 4, secondComparingIteration: 4 }`
- [x] Gate passes: `npm test`
- [x] Test count: 3004 + 5 = **3009** — **actual 3011** (3006 after T7, +5)
- [x] Phase gate passes: `npx electron-vite build`

**Tests**: unit
**Gate**: quick
**Commit**: `feat(main): turn a diff selection into an azure devops anchor`

---

### T9: Read a pull request

**What**: Create `src/main/ado-pr.ts` with `AdoPrClient({ getToken, fetchFn })` and its read methods — `findPrs`, `getPr`, `latestIteration`, `changedFiles`, `threads`, `fileSide`.
**Where**: `src/main/ado-pr.ts`
**Depends on**: T8
**Reuses**: `AdoGateway.getToken`, `fetchWithTimeout`; the model from T6–T8; the `TaskBoard` DI test style.
**Requirement**: FPRA-02, 03, 04, 05, 06, 07, 09, 15, 16

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `findPrs` sends `sourceRefName=refs/heads/<branch>`, `sourceRepositoryId=<source id>` and `status=active` to **each** ADO target
- [x] `getPr` is used for the Overview, so a 1000-character description arrives whole (the list truncates to 400)
- [x] `changedFiles` follows `nextSkip` / `nextTop` until both are 0 or absent (S7) — a 250-file fixture yields 250 files
- [x] `threads` sends `$iteration=<latest>&$baseIteration=0`
- [x] `fileSide` reads the blob size before content and never requests content above 1 MB or for a binary; a 404 for the original side of an added file is an empty side (S6)
- [x] A missing token yields the auth result; a timeout yields an error result; nothing throws
- [x] **No read method issues a POST, PATCH, PUT or DELETE** — asserted over every read test
- [x] `ado-pr.test.ts` created
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3009 + 10 = **3019** — **actual 3021** (3011 after T8, +10)

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

- [x] Each write sends exactly the URL and body in the design (reply `parentCommentId` = the thread's root comment); new threads and the general comment carry `SupportsMarkdown` = `{ type: 'System.Int32', value: 1 }` (S5)
- [x] `createThread` carries `filePath` with a leading `/`, the anchor, `changeTrackingId` and the iteration context
- [x] A 401 / 403 returns `{ ok: false, message }` with ADO's message
- [x] Each write method issues exactly one request, and only when called
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3019 + 6 = **3025** — **actual 3027** (3021 after T9, +6)

**Tests**: unit
**Gate**: full
**Commit**: `feat(main): write azure devops review comments`

---

### T11: Serve the pull request channels

**What**: Register the `ado-pr:*` handlers in `index.ts`; `ado-pr:open` and `ado-pr:open-link` re-check `isHttpsUrl` before `shell.openExternal`, as `openCommit` does. Every git read (remotes, the branch's upstream) goes through the paced `git()`.
**Where**: `src/main/index.ts`
**Depends on**: T10
**Reuses**: `handle()`; F3's opener pattern.
**Requirement**: FPRA-05, 14, 23, 32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Every handler is a delegation; `shell.openExternal` is reached only after `isHttpsUrl`
- [x] Nothing new goes through `setWindowOpenHandler` (https-only since #115, but links still go through `ado-pr:open-link`)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **3025** (unchanged) — **actual 3029** (3027 after T10, +2: the open and open-link refusals live in `ado-pr.ts` so each handler is a delegation, and are tested there as `openCommit` is)

**Tests**: none
**Gate**: build
**Commit**: `feat(main): serve the pull request channels`

---

### T12: Render third-party markdown inertly

**What**: Add `markdown-it` (+ types) and create `src/renderer/src/lib/markdown.ts` with `renderMarkdown(source)` — `html: false`, links as `data-href` with no `href`, images as links; every comment is markdown (T1, S5).
**Where**: `src/renderer/src/lib/markdown.ts`
**Depends on**: T11
**Reuses**: Nothing — new, security-critical, fully unit-tested.
**Requirement**: FPRA-10, 21, 22, 24

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `<script>alert(1)</script>` renders as escaped text
- [x] `<img src=x onerror=alert(1)>` renders as escaped text
- [x] `[x](javascript:alert(1))` renders with no `href` and no `data-href`
- [x] `[x](https://example.com)` renders with `data-href` and no `href`
- [x] `![alt](https://example.com/a.png)` renders as a link, never an `<img>`
- [x] An HTML comment and a `<details>` block render as escaped text
- [x] `[x](data:text/html,…)` renders with no `href` and no `data-href`
- [x] No output anywhere contains ` on` event attributes or an `href` attribute
- [x] `markdown-it` added to `dependencies`, version pinned
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: 3025 + 9 = **3034** — **actual 3038** (3029 after T11, +9)

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

- [x] Active, resolved, outdated, general and activity groups each receive exactly their threads; deleted threads appear nowhere
- [x] Every ADO status has a label; the statuses offered for a change exclude `unknown`
- [x] `pr-view.test.ts` created
- [x] Gate passes: `npm test`
- [x] Test count: 3034 + 5 = **3039** — **actual 3043** (3038 after T12, +5)

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

- [x] Threads for other files are excluded; left and right placements go to their sides; zones sit after the thread's end line
- [x] Two threads on the same line produce two zones in publication order
- [x] The banner shows only when the latest iteration is newer than the one on screen
- [x] Gate passes: `npm test`
- [x] Test count: 3039 + 5 = **3044** — **actual 3048** (3043 after T13, +5)

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

- [x] PR tabs never collide with file, diff, commit or All changes tabs
- [x] Pre-existing tab tests pass unedited
- [x] Gate passes: `npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: 3044 + 2 = **3046** — **actual 3050** (3048 after T14, +2)

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

- [x] Without the props, F2 and F3 behave exactly as before (checked in their tabs) — no existing caller passes either prop: the zone effect has nothing to add and the selection listener calls nothing. Checked by reading; on screen at T27
- [x] `onSelectModified` never fires for a selection on the original side — only the modified editor's `onDidChangeCursorSelection` is listened to
- [x] Zones resize with their content and are removed on unmount — a `ResizeObserver` per zone re-lays it out; the editor's disposal takes the zones, and the observers are disconnected with it
- [x] **[reconciled 2026-10-10]** Zones coexist with `fitContent`, `onHandle` and Hide / Show unchanged (#130): a thread on a line inside a hidden region shows once the region is revealed, and the editor's fitted height counts the zones — Monaco 0.56 gives a zone in a hidden area no height and draws it again when the area is revealed; content height includes zones, so the fitted measure counts them; the diff editor aligns both sides around user zones
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3050** (unchanged from T15); lint warnings 18

**Tests**: none
**Gate**: full
**Commit**: `feat(renderer): let the diff viewer carry threads and selections`

---

### T17: Hold pull request state

**What**: Create `src/renderer/src/lib/use-pull-request.ts` — search, the chosen PR per worktree in memory, detail, reload on entry, on focus (5 s debounce), after each write and on a refresh button, and the new-iteration banner.
**Where**: `src/renderer/src/lib/use-pull-request.ts`
**Depends on**: T16
**Reuses**: `use-files.ts` (the lens it already owns); `App.tsx:273` debounce pattern; `newIterationBanner`.
**Requirement**: FPRA-04, 33, 34, 35

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] No timer triggers a request (FPRA-35) — the hook has no timer at all: reads start on entry, on focus (5 s debounce, compared against the last focus time), after a successful write and from `refresh`
- [x] A write that succeeded followed by a failed reload keeps the written content with a notice (edge case) — the write is applied to the detail on screen before the reload; a failed reload of the PR on screen sets `notice` and leaves the detail
- [x] **[reconciled 2026-10-10]** `use-files.ts` treats `'pull-request'` as a lens with no local listing, watch or diff read; the mode is remembered per worktree like the other four (FXPL-13, owner 2026-10-10), so reopening the app on a worktree left in it searches Azure DevOps on entry — a read only. `refreshMode` and `loadStats` read nothing for it, `files:watch` gets `null` while it is shown, and `usePullRequest` runs inside `useFiles` as `files.pr`
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3050** (unchanged); lint warnings 18

Notes: a pull request on screen that a later search no longer lists is read once more, so a PR completed or abandoned elsewhere shows its status (edge case) instead of turning into "no pull request". Sides are cached per PR diff tab key with the iteration that was latest when they were asked for; the banner's action drops them, and the open tab reads them again.

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

- [x] Nothing posts without Ctrl+Enter or the Post button — `onPost` is called from `post()` only, which only those two reach
- [x] A failed post leaves the text exactly as typed — only a successful result clears the text; a failure sets the inline error and leaves `text` untouched
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3050** (unchanged); lint warnings 18

Note: `MarkdownBody`, the inert rendering every comment and the description use, is exported from this file: Preview is its first user, and a link click in it hands only `data-href` to the caller (FPRA-23).

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

- [x] Setting Active on a resolved thread reopens and expands it — a successful Active (or Pending) expands the thread; a resolved status collapses it
- [x] A link click sends only the `data-href`; the component never navigates — comments render through `MarkdownBody`, whose anchors carry no `href`
- [x] **[amended at F5 Spec]** The status control is chosen by the thread's provider — ADO's selector here — so F5 plugs in its Resolve / Reopen toggle without editing this component's structure — `STATUS_CONTROLS[provider]`; F5 adds an entry
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3052** (3050 + 2: owner decision 3's `rootCommentId` tests); lint warnings 18

**[owner 2026-10-10]** Azure DevOps' `fixed` reads **"Resolved"**, as its web view names it: `statusLabel('fixed')` and the expected value in `pr-view.test.ts` changed by the owner's call; the other labels are unchanged.

**[owner 2026-10-10]** `ado-pr:reply` needs the thread's root comment, and deleted comments are filtered out of `PrThreadView`, so `comments[0]` can be a reply. `PrThreadView.rootCommentId` is computed in main from the raw thread before filtering (`rootCommentId` in `ado-pr-model.ts`: the comment whose `parentCommentId` is 0, else the lowest id), with two unit tests; the existing `threads` client test's expected views gain the field.

| Criterion | `file:line` + assertion | Outcome | Covered? |
| --------- | ----------------------- | ------- | -------- |
| Root survives a deleted first comment | `src/main/ado-pr-model.test.ts:315` - `).toBe(4)` | the parent-0 comment, deleted | ✅ |
| Lowest id when no parent is named | `src/main/ado-pr-model.test.ts:319` - `.toBe(7)` | lowest id | ✅ |
| `fixed` reads Resolved | `src/renderer/src/lib/pr-view.test.ts:90` - `expect(ALL.map(statusLabel)).toEqual([... 'Resolved' ...])` | owner's label | ✅ |

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

- [x] Activating an anchored thread opens its file's PR diff at the line — the thread's location calls `onOpenDiff(file, { line, side })`; the tab strip wires it to the PR diff tab (T22/T24)
- [x] Activity is collapsed by default — `activityOpen` starts false and nothing in it mounts while closed
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3053** (3052 + 1: owner decision 2's `classifyThread` test); lint warnings 18

**[owner 2026-10-10]** A thread anchored to a file with no line stays in **General** but shows the file's name, and activating it opens that file's PR diff at the top. The `general` place carries an optional `path` (`src/shared/files.ts`), set by `classifyThread` when the thread context names a file but no line; recorded in spec.md's Assumptions table.

| Criterion | `file:line` + assertion | Outcome | Covered? |
| --------- | ----------------------- | ------- | -------- |
| File-level thread keeps its path in General | `src/main/ado-pr-model.test.ts:171` - `toEqual({ kind: 'general', path: 'src/app.ts' })` | general + path | ✅ |
| No file context stays plain general | `src/main/ado-pr-model.test.ts:165` - `toEqual({ kind: 'general' })` (existing) | general, no path | ✅ |

Note: a left-side (original) thread opens at its line on the original side, so `onOpenDiff` carries the side; an outdated thread is listed by its old line and opens nothing, since the line is gone.

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

- [x] Shown only when more than one PR is found — `PrOverview` mounts it only for a `found` search with more than one PR, above every state it shows
- [x] The choice survives switching worktrees and back while the app runs — `usePullRequest` keeps `chosen` per worktree in memory, and a reload picks it again while the search still lists it
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3053** (unchanged); lint warnings 18

Note: the picker sits at the top of the Overview, where the "several pull requests" state is said, rather than in the left column.

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

- [x] F2's layout, whitespace, folding, navigation and EOL behaviour all apply — the tab mounts F2's `DiffViewer` with the strip's layout, whitespace and Hide / Show unchanged choice, hands its handle to the strip's navigation, and main's sides carry the EOL lines
- [x] No Comment action on the original side — Comment is offered from `onSelectModified` only, which the viewer never calls for the original side
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3053** (unchanged); lint warnings 18

Beyond `PrDiffTab.tsx`: `use-files.ts` gains the `pr-diff` tab (`pr`, `id`, `path`, the PR's `file`, a one-shot `reveal`) with `openPrDiff` and `clearReveal`; `FileTabs.tsx` renders it and offers Hide / Show unchanged for it as for a one-file diff; `DiffHandle.reveal` takes an optional side, so a thread on a removed line opens at its line on the original side (FPRA-12). A thread's activation from the Overview remounts the tab, which lands once its diff is computed. Threads and Comment show only while the pull request shown is the tab's own and active.

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

- [x] Five options fit the left column at its minimum width — the selector row already wraps at the 200px minimum and no label breaks mid-word; the fifth option wraps with the others. On screen at T27
- [x] The PR tree shows each file's status with #131's `StatusGlyph` / `changeStatusView`, as the other modes do — the PR's files go through `buildTree` and the same `ChangedRows` the diff modes use
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3053** (unchanged); lint warnings 18

Note: a click on a PR file opens its PR diff directly; the solution double-click of the local modes (FXPL-28) does not apply to the provider's copy. With no pull request to list, the column says so and leaves the reason to the Overview.

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

- [x] Overview cannot be closed; PR diff tabs can
- [x] **[reconciled 2026-10-10]** The Overview uses the strip's existing fixed-tab treatment (as All changes does, #125); PR diff tabs pin and close like file tabs, and Close all / Close unpinned never close the Overview
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Phase gate passes: `npx electron-vite build`
- [x] Test count: **3046** (unchanged) — **actual 3057** (3053 + 4: the close rules live in the pure strip helpers, which carry these two criteria, so each gets a test); lint warnings 18

Beyond `FileTabs.tsx`: `tabsWithAllChanges` (`diff-view.ts`) puts the Overview first in Pull request mode instead of All changes, and offers it in no other mode; `tabsAfterClose` / `tabsAfterBulkClose` (`files-view.ts`) treat `PR_OVERVIEW_KEY` as a fixed tab like `ALL_CHANGES_KEY`; `use-files.ts`'s `StripTab` holds it, so a focus on a closed tab falls back to it. `keepUnchanged` needed no change: the strip's keys it is given include the Overview, which never has a fold choice. PR diff tabs stay open across modes, as the other modes' diff tabs do (FDIF-09). The Overview shows none of the diff controls.

| Criterion | `file:line` + assertion | Outcome | Covered? |
| --------- | ----------------------- | ------- | -------- |
| Overview is first in PR mode, once, no All changes | `src/renderer/src/lib/diff-view.test.ts:502` - `expect(strip.map(...)).toEqual([PR_OVERVIEW_KEY, ...])` | Overview, then the open tabs | ✅ |
| No Overview outside PR mode | `src/renderer/src/lib/diff-view.test.ts:513` - `expect(strip.some(... 'pr-overview')).toBe(false)` | absent | ✅ |
| Overview cannot be closed; focus falls back to it | `src/renderer/src/lib/files-view.test.ts:123`, `:126-127` - `toEqual({ tabs: strip, active: PR_OVERVIEW_KEY })`, `toEqual({ tabs: [PR_OVERVIEW_KEY], active: PR_OVERVIEW_KEY })` | kept, focused | ✅ |
| Close all / Close unpinned / its own Close never close it; PR diffs close and pin | `src/renderer/src/lib/files-view.test.ts:392`, `:396`, `:401` - `keys: [PR_OVERVIEW_KEY]`, `keys: [PR_OVERVIEW_KEY, 'pr:42:a.ts']`, `keys: prStrip.map(...)` | Overview kept; pinned PR diff kept by Close unpinned | ✅ |

**Tests**: none
**Gate**: build
**Commit**: `feat(renderer): show the pull request tabs`

---

**T25 removed (T1, S4).** Azure DevOps stored `` `List<string>` ``, `a <b> c`, quotes, `>`, `&` and accented letters byte-identical in a pull-request comment, so there is nothing to warn about and FPRA-37 was never added.

---

### T26: Record the new write posture

**What**: Amend the README's "ADO integration is view-only" to state that the app writes PR comments on explicit user action only. **The decision itself is already recorded as AD-027** (2026-09-19, at planning) — this task does not add an AD.
**Where**: `README.md`
**Depends on**: T24
**Reuses**: AD-027's wording in `.specs/STATE.md`.
**Requirement**: FPRA-32

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] README no longer claims view-only, and names exactly the four writes
- [x] `.specs/STATE.md` gains **no new AD**; AD-027 is left as recorded, and still matches what shipped (`ado-pr.ts` has exactly `reply`, `setStatus`, `createThread`, `generalComment` as writes)
- [x] The STATE handoff no longer says F4 is stacked on F3 (stale since the Files epic merged)
- [x] Gate passes: `npm run typecheck && npm run lint && npm test`
- [x] Test count: **3046** (unchanged) — **actual 3057** (unchanged); lint warnings 18

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

- [x] Read checks: the fifth mode; the PR found; Overview contents; threads under their lines; resolved collapsed; Activity collapsed; a markdown comment with a `javascript:` link rendered inert; refresh and focus reload. The sandbox holds no resolved thread and no third-party link, so "resolved collapsed" and the inert link are driven in the write run, on what the smoke posts
- [x] With `--allow-writes`: reply, status change, a thread from a two-line selection landing on those lines — read back over REST, `rightFileStart` / `rightFileEnd` equal to Monaco's selection, lines and columns (S1), rather than looked at in the web view — and a general comment, each deleted afterwards and read back `isDeleted`
- [x] Sandbox coordinates come from environment variables, never from the repository: `SMOKE_PR_WORKTREE` names a worktree on the PR's branch; the branch, the remote and the PR are found at run time, and the output prints check numbers, counts and line numbers only
- [x] Numbered pass/fail line per check; all pass against a live dev app, except one SKIP that is never counted as a pass (below)

**Results (2026-10-10, against `896c1f7`)**. The script launches its own dev app on CDP port 9333 with a throwaway `--user-data-dir` and kills only the process tree it started. `SMOKE_ONLY=overview|diff|writes` runs one section.

- Read-only: **21/21 pass, 1 skip**. With `--allow-writes`: **29/29 pass, 1 skip**. Cleanup: 3/3 smoke comments deleted and read back `isDeleted`; the PR is still a draft.
- **SKIP, FPRA-28** (no Comment on the original side): the sandbox PR modifies no existing file, so the original side has no text to select. The check runs by itself on the first PR file whose status is `modified`.
- Three defects found by this smoke were fixed in production code before it passed (§ Fixes found during Execute): item metadata as JSON, the Comment bar keeping its place, threads in a diff taking clicks and keys.
- Falsified (each mutant failed only the checks it names, and the tree was restored, `git status` clean):
  - the Comment bar mounted only with a selection fails "the diff stays where it is" (34.4 px) and "a drag selects exactly those lines";
  - no focus debounce fails the focus check (reloads 1 / 1 / 1);
  - deleted threads listed as general fail the section and deleted-thread checks;
  - a zone after the thread's first line fails "under its last line";
  - the pre-`896c1f7` zone rendering fails the real-click check, and the zone-height check, which measures `.diff-viewer-zone-space`, that rendering does not have.
- Not driven by this smoke: FPRA-08 (detached `HEAD`; the sandbox worktree is not to be touched), FPRA-34 (a new iteration needs a push to the sandbox branch), FPRA-03's picker case and FPRA-02's fork case (the sandbox has one same-repository PR). FPRA-17 is driven through the layout preference only.
- `scripts/smoke-files-commits.mjs` check 1 now expects Commits as the fourth of five modes; the whole smoke passed 30/30 on a seeded throwaway repository.

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
Phase 6:  T26 → T27
```

Strictly sequential. **T1 runs inline with the owner**, before any batch. **Packing** (~7 per batch, whole phases): Phase 2 (7) = batch 1; Phases 3 + 4 (3 + 4) = batch 2; Phase 5 (9) = batch 3 — one tight chain of components, left whole; Phase 6 (2) = batch 4. 26 tasks > 8, so the sub-agent offer applies — offer-then-confirm.

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
| T26 | T24 | T24 → T26 (boundary) | ✅ |
| T27 | T26 | T26 → T27 | ✅ |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | Spike findings | manual | manual | ✅ |
| T2 | Gateway token sharing | none (existing tests) | none | ✅ |
| T3 | Shared types + contract | none | none | ✅ |
| T4–T8 | Pure main modules | unit | unit | ✅ |
| T9, T10 | DI client | unit | unit | ✅ |
| T11 | Thin Electron shell | none | none | ✅ |
| T12 | Security-critical renderer helper | unit | unit | ✅ |
| T13–T15 | Pure renderer helpers | unit | unit | ✅ |
| T16–T24 | Renderer components / hook | none | none | ✅ |
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
| FPRA-36 | met by #122 (`\x00` + control-byte test); T2 keeps it green |

All 36 mapped; none unmapped. FPRA-37 was not added: T1 found comments unaltered (S4), and T25 was removed.

---

## Reconciliation (2026-10-10)

The plan was written on 2026-09-19, stacked on F3, before the Files epic and about 900 commits reached `main`. Rebased onto `origin/main` `2e3307d` and checked against the code:

| Plan said | `main` has | Change |
| --------- | ---------- | ------ |
| T2 fixes the raw NUL in `ado-gateway.ts` and adds a byte test | Fixed by #122 (#117) as `\x00`, with the test | FPRA-36 met; T2 only makes `getToken()` public |
| T2 exports a free `getAdoToken()` | Token acquisition is a private, cached method of `AdoGateway` | Share the gateway's method: one cache, one `az` process |
| T4 creates `link-guard.ts` / `isOpenableLink` | AD-044's `isHttpsUrl` in `url-policy.ts`, used by `openCommit` | T4 adds the FPRA-23 cases to `url-policy.test.ts`; no new module |
| `setWindowOpenHandler` forwards any URL | https-only since #115 | Risk gone; links still go only through `ado-pr:open-link` |
| Mode added in `FileTree` / `FileTabs` only | `FilesState.mode` is persisted per worktree; `use-files.ts` branches per lens | T17 makes the PR lens skip local listing and watching; the mode is remembered like the others (owner, 2026-10-10) |
| Overview "cannot be closed" | Pins, Close all / Close unpinned, and a fixed All changes tab (#125) | T24 reuses the fixed-tab treatment and spares the Overview from bulk closes |
| `DiffViewer` gains `zones` | It now also has `fitContent`, `onHandle` and Hide / Show unchanged (#130) | T16 checks zones inside hidden regions and in the fitted height |
| Tree shows change status | `StatusGlyph` / `changeStatusView` (#131) | T23 reuses them |
| Git reads in main | Every git call is paced since #154 | T11 reads remotes through `git()` |
| Debounce at `App.tsx:165`, `relativeTime` in status-bar | `App.tsx:273`, `lib/relative-time.ts` | References updated |
| Baseline 945 (projected) | **2977** measured | Counts shifted; feature ends at **3046** (T25 removed after T1) |
| T1 sandbox in an org of the owner's choosing | Owner chose their employer's organization | Draft PR with no reviewers on a throwaway branch; coordinates by env var; findings fictitious |

Execution (owner, 2026-10-10): T1 inline with the owner, then four batch workers — Phase 2, Phases 3 + 4, Phase 5, Phase 6 — followed by the Verifier.

## Fixes found during Execute

- [x] **Item metadata as JSON (found by T27, 2026-10-10).** The read-only smoke showed every PR diff failing with a JSON parse error: `fileSide`'s `items` call lacked `$format=json`, so Azure DevOps answered with the file's text (S6 was recorded without the parameter the probe had sent; re-measured live, `text/plain` without it, `application/json` with it). Fixed in `src/main/ado-pr.ts`; the client test's fake now answers like Azure DevOps (text unless `$format=json`) and asserts the parameter — it fails on the old code. Gate: 3057 tests, lint 18. Commit `fix(main): ask azure devops for pull request item metadata as json`.
- [x] **Comment bar keeps its place (found by T27, 2026-10-10).** The smoke measured the diff moving 34.4 px when a selection began: the Comment bar mounted above the editor only while a selection existed, so a mouse drag ended on another line than the one under the pointer (FPRA-27). The bar is now always mounted for the PR on screen; the button is disabled with no selection or while a draft is open, and the label reads "Select lines on the right side to comment" until there is one. Components are hand-verified (Test Coverage Matrix); the smoke's check 18 is the evidence. Gate: typecheck, lint 18, build. Commit `fix(renderer): keep the pull request comment bar in place`.
- [x] **Threads in a diff take clicks and keys (found by T27, 2026-10-10).** The smoke's real-click check failed: `elementFromPoint` at a thread's toggle, Reply, status, the composer and Post all hit Monaco's `.view-lines`, because Monaco stacks its text layer above the view zones T16 drew the threads in; a new thread's composer never got the focus and typing went to the editor. Every zone is now an empty view zone that opens the gap plus an overlay widget holding the content, the pattern of VS Code's `ZoneWidget`: placed at the gap's top on each render (`onDomNodeTop`), across the text area (`getLayoutInfo`, `onDidLayoutChange`), hidden while Monaco does not draw the gap (folded or off screen), and a wheel over it scrolls the editor. Monaco's keybindings take none of the composer's keys (typing, Ctrl+A, Ctrl+Enter, Ctrl+F probed), so nothing stops propagation, which would also cut React's delegated handlers. Fixed in `DiffViewer.tsx`; the real-click check passes and fails on the old rendering (mutant run). Gate: 3057 tests, lint 18, build. Commit `fix(renderer): let pull request threads in a diff take clicks and keys`.
