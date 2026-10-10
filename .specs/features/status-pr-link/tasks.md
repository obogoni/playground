# Status PR Link Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: inline. Two pure functions decide everything the bar shows — `reviewMark(reviewers)` and `prChip(lookup)`, which turns both providers' search results and details into one of `one`, `many`, `create`, `unknown`, `hidden` — so rendering is a switch. The lookup is lifted out of F4/F5's `usePullRequest` into a shared hook App mounts (T3, T4); see the reconciliation below for why it cannot be used as is.
**Status**: Reconciled against the executed F4/F5 code 2026-10-10 — awaiting owner approval (planned 2026-09-22)

**Branch**: `feature/status-pr-link` off `origin/main` `a170e6b` (F4 and F5 merged upstream 2026-10-10), rebased `--onto origin/main 28adf84`; backup of the original plan branch `backup/status-pr-link-prerebase`.

**Test baseline**: 3122 tests in 141 files (`npx vitest run`), lint 18 warnings, measured 2026-10-10 (the tree of `a170e6b` equals the F5 tip it was measured on).

### Reconciliation with the executed F4/F5 code (2026-10-10)

| Planned | As built | Effect on the plan |
| ------- | -------- | ------------------ |
| `PrSearch` kinds `found`, `none`, `no-ado-remote`, `auth`, `detached`, `error` | `src/shared/files.ts`: `found`, `none { createUrlAvailable }`, `no-remote`, `auth`, `detached`, `rate-limited { resetAt }`, `error`; `PrDetailResult` adds `rate-limited` too | T2: `rate-limited` with nothing found is `unknown`, its reason the reset time; `no-remote` and `detached` hide the chip |
| F4's reviewer states | `ReviewerState`: `approved`, `approved-with-suggestions`, `no-vote`, `waiting-for-author`, `rejected`, `changes-requested`, `commented`, `dismissed` | T1: ✕ `rejected`; ⏸ `waiting-for-author`, `changes-requested`; ✓ `approved`, `approved-with-suggestions`; no mark for `no-vote`, `commented`, `dismissed` |
| Both providers may list PRs for one branch | FPRG-07 as amended in F5: a branch lists only the PRs of the provider whose remote it tracks; the other provider answers `none` with `createUrlAvailable: false` or `no-remote` | `many` comes from one provider with several target branches; SPRL-19 still holds when the other provider fails (`auth`, `error`, `rate-limited`) |
| `use-pull-request` may already live above the direction switch | It does — `useFiles` calls it and App always mounts `useFiles` — but it searches only while the Files direction is in Pull request mode, and reads the detail of **one** PR (the only one, or the one picked) | Not usable as is: the bar needs a search on selection in every direction and every found PR's reviewers. T3 extracts the rules, T4 lifts search, details, the pick and the rate-limit memory into `usePrLookup`, which App mounts and both `usePullRequest` and the bar read |
| FPRG-26 | A provider that answered `rate-limited` is not asked again by a reload that happens on its own (focus, after a write), only by one the user asked for | The bar's focus lookups obey the same memory — it lives in the shared hook |
| Openers `ado-pr:open`, `github-pr:open` | As planned: `{ worktreePath, pr }` or `{ worktreePath, create: true }`; main builds the URL | T6 calls them; the failure reason text is F5's `failureText`, exported from the shared rules |
| Bar target | `barTargetFor` in `status-bar.ts`: the tree selection, or in Agents the selected session's worktree; picking a session also picks its worktree in App | The lookup is keyed by worktree path and the bar paints the entry of its own target |
| T7 stub "wrap `window.api.invoke`" | `window.api` is exposed through `contextBridge`, whose copy the page cannot change; the preload's `api.invoke` calls `ipcRenderer.invoke` at call time | T8 stubs `ipcRenderer.invoke` in the preload's isolated world over CDP, for the four lookup channels only; it proves the stub first and stops if it cannot be installed |

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts; style sampled from `src/renderer/src/lib/status-bar.test.ts` and `pr-view.test.ts`. The repository tests no hook directly; hook decisions live in pure modules that are tested.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Pure chip logic (`pr-status.ts`) | unit | 1:1 to SPRL-03..08, 12, 15–19 and the failed-`get` edge case, for both providers' reviewer states | `src/renderer/src/lib/pr-status.test.ts` | `npm test` |
| Pure lookup rules (`pr-lookup.ts`) | unit | Which providers are asked (FPRG-26 memory), which PRs are read, how an answer lands in the per-worktree entry (stale ticket dropped, other worktree cached), the failure text | `src/renderer/src/lib/pr-lookup.test.ts` | `npm test` |
| Lookup hook and App wiring | none (smoke) | SPRL-01, 02, 09, the stale-answer and shared-lookup edge cases | — | smoke |
| `StatusBar` component and CSS | none (CDP smoke) | SPRL-10–14 | — | smoke |
| End to end, stubbed providers | manual CDP smoke | Every chip kind, rendered from stubbed `find`/`get` answers | `scripts/smoke-status-bar.mjs` | live dev app |
| Pull request mode, regression | manual CDP smoke | F4/F5's read-only sections unchanged after T4 | `scripts/smoke-files-pr-ado.mjs`, `scripts/smoke-files-pr-github.mjs` (read-only) | live dev app |
| End to end, real PR | manual, owner-driven | SPRL-01, 10, 11, 15 against PRs the owner names | — | live dev app |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | Wiring tasks and phase ends | `npx electron-vite build` |
| Manual | T8, T9 | smoke / owner check |

**Lint is judged by exit code AND by warning count** — the count above, diffed at every gate.

---

## Execution Plan

### Phase 1: Rules

```
T1 → T2 → T3
```

### Phase 2: Lookup and opening

```
T3 → T4 → T5
```

### Phase 3: The chip

```
T5 → T6 → T7
```

### Phase 4: Prove

```
T7 → T8 → T9
```

---

## Task Breakdown

### T1: `reviewMark` and the tooltip lines

**What**: `reviewMark(reviewers)` → `'rejected' | 'changes' | 'approved' | null`, the worst mark winning, over `ReviewerState`: `rejected` → `rejected`; `waiting-for-author`, `changes-requested` → `changes`; `approved`, `approved-with-suggestions` → `approved`; `no-vote`, `commented`, `dismissed` add nothing. `reviewLines(reviewers)` → one `"<name>: <state label>"` line per reviewer.
**Where**: `src/renderer/src/lib/pr-status.ts` (new) and its test
**Depends on**: None
**Reuses**: `Reviewer`, `ReviewerState` (`src/shared/files.ts`)
**Requirement**: SPRL-04, SPRL-05, SPRL-06, SPRL-07, SPRL-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests for each mark from Azure DevOps-shaped reviewers (votes, groups, required) and GitHub-shaped ones (`changes-requested`, `commented`, `dismissed`); rejected beats changes beats approved; approved-with-suggestions counts as approved; no votes → `null`; groups and required flags do not change the mark
- [x] Gate check passes: `npm test` (full gate run: typecheck, lint 18 warnings, tests)
- [x] Test count: 3122 + 9 = 3131

**Done** 2026-10-10. The state labels moved from `PrOverview.tsx` into `pr-status.ts` (`REVIEWER_STATES`), so the Overview and the tooltip read one map.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(status-bar): mark a pull request by its reviews`

---

### T2: `prChip`

**What**: `prChip({ searches, details })` — `searches` as `PrSearches`, `details` by `prKey` — → `{ kind: 'one', pr, mark, draft, reviewers } | { kind: 'many', prs, notes } | { kind: 'create', provider } | { kind: 'unknown', reason } | { kind: 'hidden' }`. Reasons and notes use F5's `failureText` (moved to `pr-lookup.ts` by T3, so T2 imports it from `use-pull-request.ts` and T3 moves the import).
**Where**: `src/renderer/src/lib/pr-status.ts`
**Depends on**: T1
**Reuses**: `PrSearch`, `PrDetailResult`, `prKey` (`pr-view.ts`)
**Requirement**: SPRL-03, SPRL-12, SPRL-15, SPRL-16, SPRL-17, SPRL-18, SPRL-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: one PR from either provider; several from one provider → `many`; one provider failing (`auth`, `error`, `rate-limited`) while the other found → the found PRs with a note; `none` with creation available on one provider → `create` naming it, without on both → `hidden`; `auth`, `error` or `rate-limited` with nothing found → `unknown` carrying the reason; `no-remote` or `detached` on both → `hidden`; nothing searched yet → `hidden`; a PR whose detail failed or is not read yet → no mark and reviewers unknown
- [x] Gate check passes: `npm test`
- [x] Test count: T1 count + the new tests

**Done** 2026-10-10, 3131 + 14 = 3145 tests, lint 18. Shape as built: `prChip(searches, reads)`, items carry `{ pr, review }` with `review` `read` / `failed` / `pending` (draft is `pr.isDraft`). A single PR keeps the other provider's failure in `notes` too, for its tooltip, since one PR has no menu. `failureText` is exported from `use-pull-request.ts` until T3 moves it.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(status-bar): decide what the pull request chip shows`

---

### T3: The lookup's rules, pure

**What**: `src/renderer/src/lib/pr-lookup.ts`: the per-worktree entry (`searches`, the last good detail and the last failure per PR by `prKey`, the pick, the rate-limited providers, a load ticket) and the pure steps over it — which providers a reload asks (FPRG-26: a reload that happens on its own skips a provider that answered `rate-limited`), which PRs it reads (every found PR, plus the one on screen when the search no longer lists it), and how an answer lands (an older ticket is dropped; an answer always lands in its own worktree's entry). `failureText` moves here from `use-pull-request.ts`.
**Where**: `src/renderer/src/lib/pr-lookup.ts` (new) and its test; `use-pull-request.ts` imports `failureText`
**Depends on**: T2
**Reuses**: `load`'s rules in `use-pull-request.ts`, which they replace in T4
**Requirement**: SPRL-01, SPRL-09, the stale-answer edge case

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a focus reload skips a rate-limited provider and keeps its answer, a user reload asks it again; every found PR is read, plus an on-screen PR no longer listed; a failed read keeps the last good detail beside the failure (the older-ticket drop and the answer landing in its own worktree's entry are the hook's, checked by T8's stale-answer section)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done** 2026-10-10, 3145 + 11 = 3156 tests, lint 18. `pr-lookup.ts` holds the entry (`searches`, `reads` by `prKey` with `PrRead`, `chosen`, `limited`, `loading`), `providersToAsk`, `landSearches`, `prsToRead`, `landRead`, and the helpers that moved out of `use-pull-request.ts`: `PrFailure`, `PrSearches`, `PROVIDERS`, `providerName`, `resetTime`, `failureText`, `refOf`, `sameRef`, `foundPrs` (importers updated: `PrOverview`, `PrPicker`, `pr-status`). `PrRead` moved from `pr-status.ts`. Spec deviation: the ticket drop and per-worktree landing stay in the hook, as stated above.

**Tests**: unit
**Gate**: full

**Commit**: `refactor(files): state the pull request lookup's rules as pure functions`

---

### T4: One lookup for the bar and the Pull request mode

**What**: `usePrLookup` (new hook, mounted by App above the direction switch) holds the entries of T3 and runs a lookup — both providers' `find` in parallel, then `get` for every PR to read — on: the bar target changing, window focus (5 s debounce, `FOCUS_RELOAD_MS`), the TopBar Refresh, and on behalf of the Pull request mode (entering it, a pick, its refresh, after a write — `search: false`, the shown PR only). `usePullRequest` drops its own search, detail fetch, pick and rate-limit memory and reads them from `usePrLookup`; it keeps its notice, sides, revision banner and writes. Nothing polls.
**Where**: `src/renderer/src/lib/use-pr-lookup.ts` (new), `use-pull-request.ts`, `use-files.ts`, `App.tsx`
**Depends on**: T3
**Reuses**: `usePullRequest`'s `load`, `findOn`, `getOn`
**Requirement**: SPRL-01, SPRL-02, SPRL-09, the stale-answer and shared-lookup edge cases

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The Pull request mode's own behaviour unchanged: the read-only sections of `smoke-files-pr-ado.mjs` and `smoke-files-pr-github.mjs` pass against the PRs the owner names — **checked at T9**: Azure DevOps 21/21 (1 SKIP, as in F4), GitHub 10/10 (4 SKIP: the PR has no reviewers, threads or comments)
- [x] With the Files direction in Pull request mode on the bar's worktree, one selection runs one `find` per provider, not two — **checked at T8**: the decision is `joinsRunning` (`pr-lookup.ts`), unit-tested; the smoke counts one `find` per provider on entering the mode from the chip. Selection and entering coincide when one render changes both the bar's worktree and the mode's (app start, or a selection made while the Files direction shows a worktree whose saved mode is Pull request); no smoke check holds answers across that overlap yet (Verifier follow-up F1)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Done** 2026-10-10, 3156 + 2 = 3158 tests, lint 18, build green. `usePrLookup` (`use-pr-lookup.ts`) holds the entries and owns `FOCUS_RELOAD_MS` (`use-github-status.ts` repointed); App mounts it above `useFiles`, following `barTargetFor`'s worktree, and the TopBar Refresh calls its `refresh`. A search asked while an equal one runs for the same worktree joins it, so the bar's selection lookup and the mode's entering lookup make one call per provider. Two changes the lint rule `react-hooks/set-state-in-effect` forced, both derivations now: the PR on screen is `shown` in the lookup entry, set by `landSearches` and kept when the search stops listing it; the revision banner is derived from the open diffs' own revisions (`behind`), so the mode's `onScreen` is gone.

**Tests**: none
**Gate**: build

**Commit**: `refactor(files): share the pull request lookup above the directions`

---

### T5: Open a PR in the Files direction from outside it

**What**: `openPullRequest(worktreeId, pr)` in App: select the worktree, switch to the Files direction with that worktree's mode set to `pull-request` in one config patch (as `openChangedFiles` does), and set the pick in `usePrLookup` for that worktree.
**Where**: `src/renderer/src/App.tsx`
**Depends on**: T4
**Reuses**: `openChangedFiles`
**Requirement**: SPRL-10, SPRL-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build`

**Done** 2026-10-10, 3158 tests, lint 18, build green. `openPullRequest(worktreeId, pr)` in App: one config patch (direction Files, that worktree's mode `pull-request`), then `prLookup.choose`. It reaches `StatusBar` as `onOpenPullRequest`, declared on the props in this task and used by T6.

**Tests**: none
**Gate**: build

**Commit**: `feat(files): open a pull request from outside the files direction`

---

### T6: The chip and its menu

**What**: `StatusBar` renders `prChip`'s answer for its target: `PR #<n> · Draft <mark>` with a tooltip (reviewer lines, or that they could not be read) and a ↗; `<n> PRs` with a menu (each item: number, title, target branch, provider, mark; opens in the app; its own ↗; provider notes in the footer; Escape or outside click closes); a muted `Create PR`; a muted `PR ?` with its reason; nothing for `hidden`. ↗ and Create PR call `ado-pr:open` / `github-pr:open`.
**Where**: `src/renderer/src/components/StatusBar.tsx`
**Depends on**: T5
**Reuses**: the bar's popover dismissal (`SyncPopover`)
**Requirement**: SPRL-03, SPRL-08, SPRL-10..18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Done** 2026-10-10, 3158 tests, lint 18, build green. `PrSection`, `PrMenu`, `BrowseButton` and `ReviewMarkGlyph` in `StatusBar.tsx`, after the spacer and before the sync section, hidden for a deleted folder like the counter. App passes `prEntry` (the lookup entry of the bar's own worktree). The number reads `#<n>` on both providers, as the spec writes it (the Overview keeps `!<n>` for Azure DevOps). Marks carry `role="img"` and an `aria-label`. A single PR's tooltip: title, target and provider, reviewer lines (or why they could not be read), then any other provider's note. Browser and create go through `ado-pr:open` / `github-pr:open`; a failure is a toast, as in the Overview.

**Tests**: none
**Gate**: full

**Commit**: `feat(status-bar): show the branch's pull request`

---

### T7: Chip styles

**What**: The chip, its marks (✕ ⏸ ✓ with text labels for screen readers, never colour alone), the muted variants and the menu, in both themes, fitting the bar at its minimum width.
**Where**: `src/renderer/src/components/StatusBar.css`
**Depends on**: T6
**Reuses**: the bar's section and popover styles
**Requirement**: SPRL-03..07, SPRL-15, SPRL-17

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] At 1100 px wide the bar does not wrap with a long branch and a `2 PRs` chip — **checked at T8**: 0 px overflow, chip inside the bar, bar 26 px tall
- [x] Gate check passes: `npm run lint` and `npx electron-vite build`

**Done** 2026-10-10, lint 18, build green. The chip copies the sync trigger's metrics and never shrinks (the branch gives way first); marks are coloured with `--red`, `--amber`, `--green` on top of their glyph and label; the menu reuses the sync popover's surface, anchored right, 440 px wide, title and target branch truncating.

**Tests**: none
**Gate**: build

**Commit**: `style(status-bar): style the pull request chip`

---

### T8: Smoke — every chip kind, stubbed

**What**: A section in `smoke-status-bar.mjs` that stubs `ipcRenderer.invoke` in the preload's isolated world over CDP for `ado-pr:find`, `ado-pr:get`, `github-pr:find`, `github-pr:get` only, and walks `one` with each mark and draft, `many` with its menu and a provider note, `create`, `unknown` (including `rate-limited`), `hidden`, a stale answer after switching worktree, a focus inside 5 s asking nothing, and the in-app open landing in Pull request mode.
**Where**: `scripts/smoke-status-bar.mjs`
**Depends on**: T7
**Reuses**: the script's temp workspace and restore-in-`finally`
**Requirement**: SPRL-01..18, stale-answer edge case

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The stub is proved installed (a stubbed `find` answer reaches the bar) before any check; the section stops if it cannot be
- [x] Each check seen failing with its rule broken (mark order inverted; `create` shown without `createUrlAvailable`; stale answer painted), then passing
- [x] The stub is removed in `finally`; no real provider call is made by this section
- [x] Gate check passes: `npm run lint` (warning count unchanged)

**Done** 2026-10-10. `SMOKE_ONLY=pr` 37/37, full run 90/90, unit 3162 (3158 + 4 for `joinsRunning`), lint 18. Spec deviation from the plan: the stub wraps `invoke` on the renderer's own `api` module, imported by the page from Vite (`/src/lib/api.ts`), not `ipcRenderer.invoke` in the preload's isolated world — no isolated-world globals to rely on, same guarantee: the six channels `ado-pr:{find,get,open}`, `github-pr:{find,get,open}` never reach main, every other channel passes through. The open channels are stubbed too, so ↗ and Create PR open no page. Mutants, each seen failing then passing: mark order inverted (checks 4, 6), Create PR without `createUrlAvailable` (24, 25), searches landing in the bar's worktree instead of their own (30, 31). The first full run failed the two `PR ?` checks: an earlier section deletes the gone worktree's folder, and the chip rightly hides for a missing folder; the checks moved to `main`. Screenshots (light, dark) in `%TEMP%\status-bar-smoke\pr-chip-*.png`, never the repo.

**Tests**: manual
**Gate**: manual

**Commit**: `test(status-bar): check every pull request chip state`

---

### T9: Owner check against a real PR

**Owner (2026-10-10)**: Azure DevOps: the draft PR in the employer org that F4 used is still open. GitHub: a draft PR opened on this project for the purpose (its creation is a write: go-ahead at that moment).
**What**: With the PRs the owner names at this task, the owner selects their worktree: the chip shows the PR and its mark; the chip opens Pull request mode; ↗ opens the browser; a branch without a PR shows `Create PR` and it opens the creation page. The read-only sections of the F4/F5 smokes run against the same PRs (T4's regression check).
**Where**: `.specs/features/status-pr-link/tasks.md` (result)
**Depends on**: T8
**Reuses**: the F4/F5 smokes' read-only sections
**Requirement**: SPRL-01, SPRL-10, SPRL-11, SPRL-15

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each step's outcome recorded without PR numbers, titles, org or repository names (public repository)
- [x] Nothing written to any provider (the chip only reads and opens)

**Done** 2026-10-10, driven over CDP on a dev app with a throwaway profile; the owner confirmed the browser tabs. Results, without numbers, titles, organization or repository names:

| Worktree | Chip | Tooltip | Chip click | Browser |
| -------- | ---- | ------- | ---------- | ------- |
| Branch of this feature's own draft PR (GitHub, fork to upstream) | `PR #<n> · Draft`, no mark | title, `Into main · GitHub`, `No reviewers` | Files, Pull request mode, that PR | ↗ opened the PR page |
| The F4 sandbox branch (Azure DevOps draft, no reviewers) | `PR #<n> · Draft`, no mark | title, `Into main · Azure DevOps`, `No reviewers` | Files, Pull request mode, that PR | ↗ opened the PR page |
| A fork branch whose PR was merged | muted `Create PR` | `Create a pull request on GitHub` | — | the compare page, upstream `main` from the fork branch |

Right after selection the tooltip has no reviewer line until the detail arrives (the review is `pending`); it reads `No reviewers` a moment later, as designed. The F4/F5 read-only smokes passed against the same PRs (T4's regression check). Nothing was written to any provider.

**Tests**: none
**Gate**: manual

**Commit**: `docs(specs): record the owner check of the pull request chip`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ------→ T2 ------→ T3
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7
Phase 4:  T7 ------→ T8 ------→ T9
```

Nine tasks: one batch over the ~7-task budget, so the sub-agent offer applies (Phases 1–2 and Phases 3–4 as two batches) — or inline. The Verifier runs after T9.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: marks | 2 pure functions, 1 file | ⚠️ Cohesive |
| T2: chip | 1 pure function | ✅ Granular |
| T3: lookup rules | 1 pure module | ✅ Granular |
| T4: shared lookup | 1 hook, its two consumers rewired | ⚠️ Cohesive (the lift is one move) |
| T5: opener | 1 App callback | ✅ Granular |
| T6: chip | 1 component | ✅ Granular |
| T7: styles | 1 stylesheet | ✅ Granular |
| T8: smoke | 1 section | ✅ Granular |
| T9: owner check | 1 manual check | ✅ Granular |

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
| T1 | pure chip logic | unit | unit | ✅ OK |
| T2 | pure chip logic | unit | unit | ✅ OK |
| T3 | pure lookup rules | unit | unit | ✅ OK |
| T4 | lookup hook, App wiring | none | none | ✅ OK |
| T5 | App wiring | none | none | ✅ OK |
| T6 | component | none | none | ✅ OK |
| T7 | CSS | none | none | ✅ OK |
| T8 | end to end, stubbed | manual | manual | ✅ OK |
| T9 | spec docs | none (manual) | none | ✅ OK |
