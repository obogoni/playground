## Validation: status-pr-link — PASS

Independent Verifier (author ≠ verifier), one pass. No production defect found, and every one of
SPRL-01..19 and the three edge cases has evidence. One unit mutant survived on correct production code
(the smoke kills it), and one smoke mutant survived: the "one lookup serves both" join is proved only by
a unit test of its pure rule and by code reading, because no smoke check reaches the moment where the
bar and the Pull request mode search together. Both are follow-ups under the owner's rules for this
Verifier, not blockers.

**Date**: 2026-10-10
**Spec**: `.specs/features/status-pr-link/spec.md` (SPRL-01..19, three edge cases)
**Plan**: `.specs/features/status-pr-link/tasks.md` (context only; its notes were re-derived, not trusted)
**Branch**: `feature/status-pr-link`, HEAD `9f95990`
**Diff range**: `d11f6e8..9f95990` — the code (T1–T9); `origin/main..d11f6e8` is the plan only
**Verifier**: independent sub-agent; read-only on the real worktree, mutants and smoke runs in a throwaway `git worktree` of `9f95990`

---

## Summary

| Measure | Outcome |
| ------- | ------- |
| Spec-anchored check | 19/19 ACs and 3/3 edge cases with evidence; 4 spec-precision gaps flagged (G1–G4) |
| Gate | `npm test` 3162 passed / 0 failed (143 files, 193.8 s); typecheck exit 0; lint exit 0, **18 warnings** (= baseline); `npx electron-vite build` exit 0 |
| Sensor, unit | 21/22 killed — U5 survived (killed at the smoke by SM5) |
| Sensor, smoke | 4/5 killed — SM4 survived |
| Smoke baseline, re-run by the Verifier | `SMOKE_ONLY=pr` 37/37 on the unmutated throwaway copy, own dev app, empty temp profile |
| Production defects | none |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 | ✅ Done | `reviewMark`, `reviewLines`, `REVIEWER_STATES` moved from `PrOverview.tsx` to `pr-status.ts` |
| T2 | ✅ Done | `prChip(searches, reads)`; shape differs from the plan (`review` read / failed / pending), recorded in `tasks.md` |
| T3 | ✅ Done | `pr-lookup.ts`; the ticket drop and per-worktree landing stay in the hook (stated deviation), covered by smoke checks 30–31 |
| T4 | ✅ Done | `usePrLookup` mounted in App; `usePullRequest` reads it. Its "one find per provider" box rests on `joinsRunning`'s unit test — the smoke check it cites does not discriminate the join (SM4, F1) |
| T5 | ✅ Done | `openPullRequest` in `App.tsx:273` |
| T6 | ✅ Done | `PrSection`, `PrMenu`, `BrowseButton`, `ReviewMarkGlyph` in `StatusBar.tsx` |
| T7 | ✅ Done | Smoke check 16: 0 px overflow at 1100 px, bar 26 px |
| T8 | ✅ Done | 37/37 re-run here; the stub wraps the renderer's `api.invoke` for six channels (stated deviation from the plan's preload stub) |
| T9 | ✅ Done | Owner check against real PRs recorded in `tasks.md`; not repeated (touches real providers) |

---

## Spec-Anchored Acceptance Criteria

Smoke checks are cited by the **runtime** number the script prints in a `SMOKE_ONLY=pr` run, with the
script line of the `check(...)` call. Line numbers are at `9f95990`.

### P1: See the branch's PR in the status bar

| AC | Spec-defined outcome | Evidence (`file:line` + assertion / smoke check) | Verdict |
| -- | -------------------- | ------------------------------------------------ | ------- |
| SPRL-01 | Selection → both providers' `find` in parallel, then each found PR's `get` | `src/renderer/src/lib/pr-lookup.test.ts:103-112` — `prsToRead` → every found PR, providers' order, `toEqual([ado, a, b])`; `pr-lookup.test.ts:41-46` — a user reload asks both providers; hook `use-pr-lookup.ts:94-100` (`Promise.all` over `ask`), `:143-146` (target effect); smoke 3 (`scripts/smoke-status-bar.mjs:1361`) — `ado-pr:find`, `github-pr:find`, `ado-pr:get 7`; smoke 17 (`:1512`) — both menu PRs carry a mark, so both were read | ✅ |
| SPRL-02 | Focus more than 5 s after the previous focus lookup, or Refresh → lookup again | smoke 6–8 (`:1398`) — Refresh → exactly `1+1` finds; smoke 9 (`:1415`) — two focuses 600 ms apart → `1+1`, not `2+2`; `use-pr-lookup.ts:157`, `App.tsx:490`; killed SM2 | ✅ (G3) |
| SPRL-03 | `PR #<n>`, plus `· Draft` when draft | `src/renderer/src/lib/pr-status.test.ts:125-139` — `kind: 'one'` with the draft PR by `toEqual`; smoke 4 (`:1368`) — `text.startsWith('PR #7 · Draft')`; render `StatusBar.tsx:282-297` | ✅ |
| SPRL-04 | Any rejection → ✕ | `pr-status.test.ts:23-32` — `toBe('rejected')` with approved and waiting beside it; `:65-78` groups/required weigh alike; smoke 4 — `mark === '✕'`, `aria-label 'Rejected'` | ✅ |
| SPRL-05 | No rejection, any waiting / changes requested → ⏸ | `pr-status.test.ts:34-44` — ADO `waiting-for-author` and GitHub `changes-requested` → `'changes'`; smoke 6 — `mark === '⏸'` | ✅ |
| SPRL-06 | No rejection or changes, any approval → ✓ | `pr-status.test.ts:46-52` — approved, approved-with-suggestions → `'approved'`; smoke 7 — `mark === '✓'` | ✅ |
| SPRL-07 | No vote → no mark | `pr-status.test.ts:54-63` — no-vote, empty, `commented`, `dismissed` → `toBeNull()`; smoke 8 — `mark === null` | ✅ |
| SPRL-08 | Tooltip lists every reviewer with their state | `pr-status.test.ts:81-96` — exact lines `'Ana: Approved with suggestions'`…, in order; smoke 5 (`:1376`) — title includes `Ana: Approved`, `Bruno: Rejected`; `StatusBar.tsx:227-239` | ✅ |
| SPRL-09 | A lookup for an already-seen worktree keeps its cached chip | smoke 31 (`:1644`) — with every answer held, re-selecting shows the cached `PR #99 ✓`; `pr-lookup.test.ts:94-99` — `landSearches` keeps `reads` (`toBe(reads)`); hook only flags `loading` (`use-pr-lookup.ts:90`); killed SM1 | ✅ |

### P1: Reach the PR

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| SPRL-10 | One-PR chip click → Files direction, Pull request mode, that PR | smoke 12 (`:1459`) — `direction 'Files'`, `mode 'Pull request'`, title `Fix login redirect 7`; `App.tsx:273-286` (one config patch + `prLookup.choose`); T9 owner check against real PRs (recorded) | ✅ |
| SPRL-11 | ↗ → main opens the PR through the provider's opener | smoke 11 (`:1447`) — exactly one call, `ado-pr:open`, `id 7`, not `create`; `StatusBar.tsx:99-104`; T9 owner check | ✅ |
| SPRL-12 | More than one PR → `<n> PRs`, menu with number, title, target branch, provider, mark | `pr-status.test.ts:157-187` — `kind: 'many'`, each item its own mark; ADO first; smoke 15 (`:1491`) — `'2 PRs'`, not muted; smoke 17 (`:1512`) — `[['#12','Fix login redirect 12','→ main','GitHub','⏸'], ['#13',…,'→ release/2.0','GitHub','✓']]` by exact JSON | ✅ |
| SPRL-13 | Menu pick opens as in 10; its ↗ as in 11 | smoke 21 (`:1543`) — one `github-pr:open`, `id 13`; smoke 22 (`:1551`) — Pull request mode on `Fix login redirect 13`; killed SM3 | ✅ |
| SPRL-14 | Outside click or Escape closes the menu | smoke 19 (`:1531`) — Escape → `menu === null`; smoke 20 (`:1536`) — click on the repository name → `menu === null`; `StatusBar.tsx:359-372` | ✅ |

### P1: No PR, or no answer

| AC | Spec-defined outcome | Evidence | Verdict |
| -- | -------------------- | -------- | ------- |
| SPRL-15 | No PR + creation available → muted `Create PR` opening the creation page through main | `pr-status.test.ts:210-223` — `{ kind: 'create', provider: 'github' }` and `'azure-devops'`; smoke 23 (`:1563`) — `'Create PR'`, muted, a `BUTTON`; smoke 24 (`:1572`) — one `github-pr:open` with `create: true`; T9 owner check | ✅ (G2) |
| SPRL-16 | No PR, no creation → no chip | `pr-status.test.ts:225-227` — `{ kind: 'hidden' }`; smoke 25 (`:1582`) — `!present` | ✅ |
| SPRL-17 | `auth` / `error` / `rate-limited`, nothing found → muted `PR ?`, tooltip = reason | `pr-status.test.ts:229-253` — reasons `'Azure DevOps sign-in failed — run az login'`, `'GitHub: socket hang up'`, `'GitHub refuses requests until'`; smoke 27 (`:1600`) — `'PR ?'`, muted, title `=== 'GitHub: socket hang up'`; smoke 28 (`:1610`) — title starts `GitHub refuses requests until` | ✅ (G2) |
| SPRL-18 | No recognised remote or detached HEAD → no chip | `pr-status.test.ts:264-271` — both `no-remote`, both `detached` → `hidden`; `:273-275` nothing answered → `hidden`; smoke 26 (`:1589`), 29 (`:1621`) — `!present` | ✅ |
| SPRL-19 | One fails, other finds → chip reflects the found PRs; the failure only as a note in the menu | `pr-status.test.ts:189-208` — `many` keeps both PRs, `notes` `['Azure DevOps sign-in failed — run az login']`; one PR keeps the other's note; smoke 18 (`:1521`) — menu notes by exact JSON | ✅ (G1) |

### Edge cases

| Edge case | Evidence | Verdict |
| --------- | -------- | ------- |
| Worktree changes while a lookup is in flight → the late answer is cached for its own worktree, never painted on the new one | smoke 30 (`:1636`) — answers held for one worktree, another selected, answers released → chip still `Create PR` for the new branch; smoke 31 — the released answer shows on re-selecting its own worktree; `use-pr-lookup.ts:85-87,101,117` (per-worktree ticket), `:80-82` (patch by path); author's mutant "searches landing in the selected worktree" killed by 30–31 (recorded in `tasks.md`) | ✅ |
| `get` fails while `find` succeeded → number and draft, no mark, tooltip says the reviewers could not be read | `pr-status.test.ts:277-293` — `review: { kind: 'failed', reason: 'The reviewers could not be read: HTTP 500' }` (no cached detail); smoke 10 (`:1428`) — `PR #7 · Draft`, `mark === null`, title includes the sentence, **with** a cached good detail from the previous refresh; killed SM5; U5 survived at unit level (F2) | ✅ |
| Pull request mode and status bar on one worktree → one lookup serves both | `pr-lookup.test.ts:165-186` — `joinsRunning` truth table (`toBe(true)` for a user or focus search over a running user search; `false` for a pick, a write, nothing running, or a focus-run under a user search); wiring `use-pr-lookup.ts:127-141` and the mode's call `use-pull-request.ts:170-173` (code reading); smoke 13 (`:1466`) counts `1+1` finds on entering the mode from the chip, but the bar is idle then — SM4 (join disabled) survived | ⚠️ thin — F1 |

### Spec-precision gaps

- **G1 — SPRL-19 with a single PR.** "The failure SHALL appear only as a note in the menu", but one PR has
  no menu. The code puts the other provider's note in the one-PR chip's tooltip
  (`StatusBar.tsx:235`, `pr-status.ts:103`), unit-asserted (`pr-status.test.ts:198-207`); no smoke check
  renders it. Defensible; the spec does not say.
- **G2 — SPRL-15 vs SPRL-17.** One provider offers creation while the other failed: AC 15 says
  `Create PR`, AC 17 says `PR ?`. The code lets the failure win (`pr-status.ts:105-106`), asserted at
  `pr-status.test.ts:255-262`. Rare in practice (a branch tracks one provider's remote; the other usually
  answers `no-remote`), but the spec should name the winner.
- **G3 — SPRL-02 "more than 5 seconds".** The debounce skips a focus at `< 5000 ms`
  (`use-pr-lookup.ts:157`), so a focus at exactly 5 s runs. A one-millisecond boundary, not a defect; the
  smoke checks 600 ms (skipped) and 5.2 s (asked).
- **G4 — SPRL-02 and FPRG-26.** The spec says a focus "repeats the lookup"; the code skips a provider in
  the rate-limit memory on a focus (`pr-lookup.ts:130-136`, unit-tested `pr-lookup.test.ts:34-39`),
  carrying F5's FPRG-26 over to the bar. Consistent with F5, unstated here.

---

## Gate Check

- **Commands**: `npm run typecheck`, `npm run lint`, `npm test`, `npx electron-vite build`, all on the real worktree (read-only; `out/` is ignored)
- **Tests**: 3162 passed, 0 failed, 0 skipped — 143 files, 193.8 s
- **Test count before feature**: 3122 (141 files), per `tasks.md` baseline
- **Test count after feature**: 3162 (143 files) — **+40**: `pr-status.test.ts` 23 (9 marks/lines + 14 chip), `pr-lookup.test.ts` 17; matches T1–T4 and T8's recorded deltas
- **Typecheck**: exit 0 · **Lint**: exit 0, 18 warnings (baseline 18, unchanged) · **Build**: exit 0
- **Test integrity**: no existing test removed; the only edited importers are `PrOverview.tsx`, `PrPicker.tsx`, `use-github-status.ts` (import paths)

---

## Discrimination Sensor

Unit mutants ran in a throwaway `git worktree` of `9f95990` with its own `npm ci --ignore-scripts`
(no junction), each file restored after its run, `vitest run` over `pr-status.test.ts` and
`pr-lookup.test.ts`. Smoke mutants ran the `SMOKE_ONLY=pr` section against a dev app launched from the
same throwaway copy (port 9334, a new empty temp profile), the page reloaded after each apply and each
restore. The real worktree's `git status --porcelain` was empty before and after.

| # | Where | Mutation | Tests run | Killed? |
| - | ----- | -------- | --------- | ------- |
| U1 | `src/renderer/src/lib/pr-status.ts:44` | `changes` outranks `rejected` | unit | ✅ (1 failed) |
| U2 | `pr-status.ts:37` | approved-with-suggestions adds no mark | unit | ✅ (1) |
| U3 | `pr-status.ts:35` | GitHub `changes-requested` marks approved | unit | ✅ (2) |
| U4 | `pr-status.ts:39` | a GitHub comment marks approved | unit | ✅ (1) |
| U5 | `pr-status.ts:111-120` | a cached good detail beats a failed `get` (detail checked first) | unit | ❌ **Survived** — killed at the smoke by SM5 (F2) |
| U6 | `pr-status.ts:105-106` | Create PR wins over a failure | unit | ✅ (1) |
| U7 | `pr-status.ts:103` | no `one` kind (one PR falls through) | unit | ✅ (5) |
| U8 | `pr-status.ts:127-129` | a rate-limited search is no failure | unit | ✅ (1) |
| U9 | `pr-status.ts:103` | one PR drops the other provider's note | unit | ✅ (1) |
| U10 | `pr-status.ts:101` | Create PR without `createUrlAvailable` | unit | ✅ (2) |
| U11 | `pr-status.ts:97` | only a provider's first PR counts | unit | ✅ (2) |
| U12 | `pr-status.ts:131` | an error note does not name its provider | unit | ✅ (2) |
| U13 | `pr-status.ts:53` | the best mark wins | unit | ✅ (5) |
| U14 | `src/renderer/src/lib/pr-lookup.ts:134` | a user reload keeps the rate-limit memory | unit | ✅ (1) |
| U15 | `pr-lookup.ts:153` | old searches win over new answers | unit | ✅ (1) |
| U16 | `pr-lookup.ts:174` | a PR read twice (no de-duplication) | unit | ✅ (1) |
| U17 | `pr-lookup.ts:198` | a failed read drops the last good detail | unit | ✅ (1) |
| U18 | `pr-lookup.ts:221` | a user search joins a focus search that keeps the memory | unit | ✅ (1) |
| U19 | `pr-lookup.ts:220` | a pick joins a running search | unit | ✅ (1) |
| U20 | `pr-lookup.ts:159` | the shown PR forgotten when the search stops listing it | unit | ✅ (1) |
| U21 | `pr-lookup.ts:151` | a rate-limited answer not remembered | unit | ✅ (1) |
| U22 | `pr-lookup.ts:135` | a focus reload asks a rate-limited provider | unit | ✅ (1) |
| SM1 | `src/renderer/src/lib/use-pr-lookup.ts:90` | a lookup starting clears the worktree's cached entry (SPRL-09) | smoke `pr` | ✅ check 31 failed (`none` instead of `PR #99 ✓`), and 22 |
| SM2 | `use-pr-lookup.ts:157` | no 5 s focus debounce (SPRL-02) | smoke `pr` | ✅ check 9 failed (`finds 2+2`) |
| SM3 | `src/renderer/src/App.tsx:285` | the chip opens the mode without picking the PR (SPRL-10, 13) | smoke `pr` | ✅ check 22 failed (title `null`: the mode shows the picker for two PRs) |
| SM4 | `use-pr-lookup.ts:130` | a running search is never joined (edge case "one lookup serves both") | smoke `pr` | ❌ **Survived** — 37/37 (F1) |
| SM5 | `pr-status.ts:111-120` | U5, at the smoke | smoke `pr` | ✅ check 10 failed (tooltip lists the cached reviewers, no "could not be read") |

**Sensor depth**: expanded (shared state across two surfaces, outward page opens): 22 unit + 5 smoke
(the owner's cap). Different from the author's three smoke mutants (mark order, Create PR without
`createUrlAvailable`, searches landing in the selected worktree).
**Tally**: unit 21/22, smoke 4/5 killed. Not counted against the verdict: U5 and SM4 are test gaps on
correct production code.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — two pure modules decide everything; the hook only sequences calls; rendering is a switch |
| Surgical changes | ✅ — `usePullRequest` lost its own search, detail and memory to the shared hook; the other importers changed paths only |
| No scope creep | ✅ — no polling, no writes from the bar, no required-reviewer policy |
| Matches patterns | ✅ — the menu copies the sync popover's dismissal; openers are F4/F5's `*-pr:open`; failure text is F5's `failureText` |
| Spec-anchored outcome check | ✅ — marks, labels, chip text, reasons and channels asserted by value; 4 precision gaps flagged |
| Per-layer coverage expectation | ✅ — pure layers 1:1 by unit test; hook, App wiring and component by the smoke, per the Test Coverage Matrix |
| Every test maps to a requirement | ✅ — each test names its SPRL, edge case or FPRG |
| Documented guidelines | ✅ — `.specs/codebase/TESTING.md`; Test Coverage Matrix in `tasks.md` |

Privacy: fixtures and smoke stubs use `acme` / `platform` / `widget` / `contoso`, invented people and
titles; no real number, organization or path in the diff; the T9 record names none.

---

## Follow-ups (not blocking)

- **F1 — The join is never driven live.** SM4 survived: smoke check 13 counts finds on entering the mode
  from the chip, when the bar's lookup has long finished, so it passes with joining disabled. The join
  happens when one render changes both the bar's target and the mode's worktree — selecting, with the
  Files direction showing, a worktree whose saved mode is Pull request, or app start in that state. A
  check that does exactly that and counts `1+1` finds (with the answers held, so the two searches
  overlap) would make the edge case evidence instead of reading.
- **F2 — U5 survived at unit level.** `prChip`'s failed-`get` test has no cached detail. Add a case with
  a good detail **and** a failure in the read, expecting `kind: 'failed'`. The smoke (check 10) kills it
  today, but only on the tooltip: the cached reviewers there are all `no-vote`, so the mark is null
  either way — give the previous detail an approval so the mark itself is checked.
- **F3 — A stale run swallows a joined search.** `choose` bumps the worktree's ticket
  (`use-pr-lookup.ts:85-87,171-176`), so a search still in flight is dropped; a mode search that joined it
  (`:130`) then lands nothing, and the searches stay at the cached answer until the next focus or
  Refresh. Only reachable by clicking a cached chip while its lookup is still running; the clicked PR is
  still read and shown. Worth a look when F1's check exists.
- **F4 — SPRL-19 with one PR in the UI.** The note in the one-PR tooltip is unit-tested only; no smoke
  check renders it (see G1).
- **Spec gaps G1–G4** above — the owner may amend the spec's wording.
- **Lessons recorded** (candidates, `.specs/LESSONS.md`): L-133 (U5), L-134 (SM4), L-135..L-138 (G1–G4).

---

## Requirement Traceability Update

Recommended for `spec.md` (not edited by the Verifier): SPRL-01..19 → **Verified**; the "one lookup
serves both" edge case noted as resting on `joinsRunning`'s unit test and code reading (F1).

---

## Isolation and hygiene

- Real worktree `git status --porcelain`: empty before the gate, after the gate, and after the sensor and
  the removal of the throwaway worktree — identical
- `git worktree list` after cleanup: the four worktrees that existed before, no throwaway entry
- Processes killed: only those whose command line held the throwaway worktree or the temp profile
- No real provider asked: every `*-pr:find/get/open` call in the smoke went to the stub; T9 not repeated
