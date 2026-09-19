# Hours Calendar — Verifier Report (round 5)

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..27 + 5 edge cases)
**Diff range**: `a81df5b..4e2ce9f` (`29d1ff6`, `4e2ce9f` = T19)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — FAIL

The round-4 defect is **genuinely fixed** — `daySummary` pluralises each count on its own, splits tasks
from task-less folders and drops a part the day does not hold — and T19's three new checks are good
ones: 8 of the 10 mutants I injected now die, including every mutant that survived round 4 except one.

**One thing blocks, and it is narrow.** The smoke's own sessions are ad-hoc shells in non-git folders,
so **every count in the live run is 2 and no group carries a task**. The summary's singular branch is
therefore never rendered, and restoring the exact round-4 defect — `plural` never singularising, so a
one-block day reads `1 blocks` — **survives all 29 checks**. The fix for the defect that round 4 found
is not pinned by the check written to pin it. Check 27 already opens the drawer on a day holding
exactly one block; it just does not compare the summary there. That is one expression.

Everything else outstanding is non-blocking, and is listed as such below — including two spec
bookkeeping items that the T19 handoff reported as fixed but which are not.

---

## Round history

| Round | Range | Verdict | Why |
| ----- | ----- | ------- | --- |
| 1 | `c27b412..94f107d` | not done | 4 surviving mutants in `hours-calendar.ts`: M8 (axis start `floor`→`round`, HCAL-09), M10 (lane reuse at a touching boundary), M12 / M13 (cluster closing, HCAL-10); spec-precision gaps on HCAL-12 and the narrow-lane edge case. Lessons L-023..L-026 (`82862a0`) |
| 2 | `c27b412..be5d8ab` | done | Three unit tests added, 6 px into HCAL-12 and 64 × 36 px into the edge case. All round-1 gaps closed |
| 3 | `8b9d191..a9c98f8` | not done | Layout B (AD-031). 6 gaps: HCAL-17 evidence data-conditional (MA survived), the `hadTime` re-arm branch unevidenced (MH survived), HCAL-25 spec-precision (MB survived), drawer geometry and legend truncation code-only, `tasks.md` tables stopped at T11. Lessons L-027..L-029 (`2aff55e`) |
| 4 | `a9c98f8..a81df5b` | not done | T17 mockup pass + T18 smoke. All 6 round-3 gaps closed; MA and MH killed. New: HCAL-15's summary and swatch clauses unasserted (N1, N4, N5 survived) and the summary shipped `1 blocks`; HCAL-25's stated exception untested (MB survived); spec bookkeeping drifted. Lessons L-030, L-031 (`29d1ff6`) |
| 5 | `a81df5b..4e2ce9f` | **not done** | T19 fixes the defect (`daySummary`), splits tasks from folders, and adds checks 15 (summary), 16 (swatch ↔ bar) and 28 (Esc in a field). Gate green at 893. **N1, N4, N5 and MB are all killed**; 8 of 10 mutants die. Open: **P1** — the restored `1 blocks` defect survives, because no check exercises a count of 1; **P6** — the word "task" never renders in the smoke's data (non-blocking, known harness limit); coverage line and HCAL-27's ordering still not fixed (non-blocking) |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T19 (code) | ✅ Done | `HoursView.tsx:286` `plural`, `:289-303` `daySummary`, `:326` the call. Reviewed against HCAL-15: counts are separate, each pluralised on its own, a part absent from the day is omitted. The blocks part is unconditional — sound, since `DayCard` renders only for a day that holds time, so the count is never 0 |
| T19 (checks 15, 16) | ✅ Done | `smoke-hours-calendar.mjs:342-356` summary, `:357-364` swatch ↔ bar |
| T19 (check 28) | ✅ Done | `smoke-hours-calendar.mjs:524-547`. Correctly relocated into the past-week scenario — while both smoke sessions run every period is open and `PeriodRow` offers no Edit (TIME-47), so the check could not exist earlier in the run. The commit body records the first attempt failing on exactly that |
| T19 (gap 6 residual) | ✅ Done | `:503` now asserts `emptyDrawer.title === wedHeader`, so the empty drawer is pinned to name its day |
| T19 (gap 5) | ⚠️ **Partly done** | HCAL-27 moved into the **P1** story ✅, but not into numeric order, and the coverage line was **not** updated — gap 2 below |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck`, `npm run lint`, `npm test`, run on `4e2ce9f`
- typecheck: **exit 0**
- lint: **exit 0**, **0 errors / 18 warnings** — equals the baseline, no rise
- test: **exit 0**, **893 passed / 0 failed / 0 skipped** (55 files)
- **Test count**: 893 → 893, **delta 0**. `git diff a81df5b..4e2ce9f -- '*.test.ts'` is empty — no test file touched, so none could be deleted, skipped or weakened. This round's evidence is all in the smoke, per the renderer convention.

---

## Round-4 gaps — closure check

Smoke = `scripts/smoke-hours-calendar.mjs` at `4e2ce9f`, **29 checks**, renumbered by T19's three
insertions: 1–14 unchanged · **15 summary line (new)** · **16 swatch ↔ bar (new)** · 17 growth + stable
colour · 18 no page scroll at 1100 × 640 · 19 X closes · 20 grid narrows and returns · 21 Esc closes ·
22 ◀ closes · 23 future columns dimmed · 24 empty week text · 25 This week nothing selected ·
26 empty day names itself and says so · 27 time on the open day fills it · **28 Esc in a period field
leaves it open (new)** · 29 emptying it closes it. Manual evidence = the recorded **29/29** run on
2026-09-19 with the owner's consent.

| Round-4 gap | Now | Evidence |
| ----------- | --- | -------- |
| 1 — the summary renders `1 blocks` | ⚠️ **Fixed, not pinned** | Fixed at `HoursView.tsx:286` — `plural` singularises on `n === 1`, so a one-block day reads `1 block`. But **mutant P1 (restoring `${n} ${word}s`) survives all 29 checks**: every count in the live run is 2, and check 15 recomputes the expected string with its own copy of the same rule, so at `n = 2` both agree. Blocking — gap 1 below |
| 2 — summary and swatch clauses unasserted (N1, N4, N5) | ✅ **Closed** | Check 15 (`:342-356`) asserts the drawer's `.hours-day-total` against the **selected column header's** `aria-label` tail — a genuinely independent source — and `.hours-day-count` against a string the *script* rebuilds from DOM-derived group and block counts, so an app-side change diverges. Check 16 (`:357-364`) maps each drawer group's `.hours-group-swatch` `role-*` to the `role-*` of the bar with the same accessible-name prefix in `.hcal-col.selected`, with `swatches.length > 0` guarding a vacuous pass and a missing bar yielding `'no-bar'` rather than a silent skip. **N1, N4 and N5 all die** (see sensor) |
| 3 — "N tasks" counted groups, not tasks | ✅ **Closed** | `HoursView.tsx:290-291` counts `g.taskId !== null` as tasks and the remainder as folders; `spec.md:95` now reads "how many tasks, task-less folders and blocks it holds". Check 15 derives its own split from the `.hours-group-label.no-task` class — a *different* expression over the same field — so **mutant P2 (swapping the two) dies** |
| 4 — HCAL-25's text-field exception untested | ✅ **Closed** | Check 28 (`:524-547`) expands a block, clicks Edit, focuses the `datetime-local`, dispatches a real Escape and asserts the drawer is **still open**. `editing` and `fieldFocused` are part of the assertion, not preconditions, so a missing Edit button or a failed focus **fails** the check instead of skipping it. **MB dies** |
| 5 — spec bookkeeping | ⚠️ **Half done** | HCAL-27 is now in the **P1** block (`spec.md:102`) ✅. But it sits **before** HCAL-25, so the P1 order reads 15…20, **27, 25** — not numeric. And `spec.md:170` still reads **"Coverage: 26 total, 26 mapped to tasks, 0 unmapped"** although HCAL-27 makes 27. The T19 handoff reported both as done; neither is. Non-blocking — gap 2 below |
| 6 — residual assertion edges | ⚠️ **One of three** | "The empty drawer names its day" ✅ closed at `:503`. The chip-overflow and drawer-side assertions are still absent — **not blocking**, see gap 3 |

---

## Spec-Anchored Acceptance Criteria (this round's ACs)

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-15 (summary) | "a summary line with the day total, **how many tasks, task-less folders and blocks it holds**, and Copy" | `HoursView.tsx:289-303` `daySummary`; check 15 `summary.head.endsWith(\`, ${summary.total}\`) && summary.count === expectedCount`, with `expectedCount` rebuilt in the script at `:345-351`. Mutants P2 (split swapped), P3 (block count +1), P4 (omission rule dropped), P5 (total zeroed) and P7 (folder count wrong) **all die**. The "leaving out what the day does not hold" clause is genuinely exercised: the live run holds 0 tasks, so that part is omitted by both sides | ⚠️ **Partial** — the **singular** form has no coverage (P1 survives), and the literal word "task" is never rendered (P6 survives) |
| HCAL-15 (swatch) | "each group SHALL wear the swatch of its calendar colour" | `HoursView.tsx:342` `role={roleOf(colours, group.key)}` reading the frozen map — the same object passed to `HoursCalendar` at `:209`; check 16 compares row role to bar role per group | ✅ PASS — **N1 dies** |
| HCAL-25 | Close button, or Esc **outside** a text field, closes; Esc **inside** belongs to the field | `HoursView.tsx:66-67,142`; checks 19 (X), 21 (Esc outside), **28 (Esc inside, drawer stays open)** | ✅ PASS — **MB dies**. Round-3 gap 3 and round-4 gap 4 are both now closed |
| HCAL-27 | Empty day → the drawer keeps its head and says so | `HoursView.tsx:232-235`; check 26 `emptyDrawer.title === wedHeader && emptyDrawer.empty === 'No time recorded on this day.' && emptyDrawer.groups === 0` | ✅ PASS — **N2 dies**, and the head is now pinned to the *right* day |
| HCAL-17 | Selected day holds no time → the drawer says so | Same as HCAL-27; check 26's exact-string equality | ✅ PASS |

### Unchanged this round

`git diff a81df5b..4e2ce9f` touches one source file, `HoursView.tsx`, and within it only `daySummary`
and the one `span` that calls it. `hours-calendar.ts`, `HoursCalendar.tsx`, `HoursLegend.tsx` and every
`.css` are untouched, so HCAL-01..14, 16, 18..24, 26 keep their round-2/3/4 evidence verbatim. The five
edge cases likewise: checks 26 → 27 → 29 still walk empty → filled → emptied.

**Status**: ⚠️ HCAL-15's summary clause is substantially but not fully discriminated; every other AC in
scope passes.

---

## Discrimination Sensor

Scratch: `git worktree add …\tmp\verify-wt5 4e2ce9f` with a `node_modules` junction. Real tree
`git status --porcelain` **empty before and after**; junction and worktree removed, `git worktree list`
back to one entry. Real sources never edited; `git stash` never used.

Judged **by reading** the smoke against the recorded 29/29 run. Each mutant was applied in the scratch
and confirmed a **compilable behaviour change invisible to the unit suite** — `tsc` exit 0 and
`vitest run src/renderer` **225/225 green for all ten**.

**The fact that decides two of these:** the smoke's sessions are ad-hoc `pwsh` in `C:\Windows` and
`C:\Windows\System32` — non-git folders, so both groups are **task-less**, and each holds **one open
period**. At check 15 that means `tasks = 0`, `folders = 2`, `blocks = 2`. No count is ever 1, and the
task branch is never rendered.

| # | Line (`HoursView.tsx`) | Mutation | Verdict |
| - | ---------------------- | -------- | ------- |
| P1 | `:286` | `plural` never singularises (`${n} ${word}s`) — **the round-4 defect, restored** | ❌ **Survives** — every live count is 2, and check 15's own expected string uses the same rule, so both read "2 folders · 2 blocks". Gap 1 |
| P2 | `:290` | tasks and folders swapped (`taskId === null`) | ✅ Killed by 15 — app "2 tasks · 2 blocks" vs expected "2 folders · 2 blocks" |
| P3 | `:296` | block count off by one | ✅ Killed by 15 — "3 blocks" vs "2 blocks" |
| P4 | `:293` | omission rule dropped for tasks | ✅ Killed by 15 — "0 tasks · 2 folders · 2 blocks" vs "2 folders · 2 blocks" |
| P5 | `:325` | day total always zero | ✅ Killed by 15 — `head.endsWith(', 0h00')` false against the real header total |
| P6 | `:293` | the word `task` → `job` | ❌ **Survives** — `tasks = 0` live, so that branch returns `null` and the word never renders. Gap 4 (non-blocking) |
| P7 | `:291` | folder count wrong | ✅ Killed by 15 — folder part omitted vs expected present |
| N1 | `:342` | group swatch role forced to `slot1` | ✅ **Killed by 16** — was surviving in round 4 |
| MB | `:142` | Esc no longer spares text fields | ✅ **Killed by 28** — was surviving in rounds 3 and 4 |
| N2 | `:233` | empty drawer loses its head | ✅ Killed by 26 — `.hours-day-title` absent ≠ `wedHeader` |

**Sensor depth**: focused (10 mutations on T19's new surface and every round-4 survivor)
**Sensor tally**: **8 killed, 2 survived** (P1, P6). Round 4's N1, N4, N5 and MB are all now killed;
both survivors share one root cause — the smoke's data never produces a count of 1 or a group with a
task.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ — one 2-line helper and one function, no new component |
| Surgical changes | ✅ — one source file, one span; no test touched |
| Matches patterns | ✅ — `plural` now generalises the `period{… === 1 ? '' : 's'}` idiom the file already used at `:437`; the round-4 inconsistency is gone |
| Correct reuse of existing state | ✅ — `daySummary` reads `group.taskId`, the same field `GroupSection` uses for `.no-task`, so the label and the count cannot disagree |
| Spec-anchored outcome check | ✅ — check 15 asserts the exact string, and the total against an independent source |
| Test independence | ✅ — the expected count is rebuilt from the DOM, not copied from the app's output, so an app-side change diverges rather than moving with it |
| Per-layer coverage (pure logic 1:1; renderer by smoke) | ⚠️ — the singular branch is unreachable with the harness's data |
| Every check maps to a spec requirement | ✅ — checks 15, 16, 28 each name their AC in the file header |
| Spec bookkeeping consistent | ❌ — gap 2 |

---

## Ranked gaps

### Gap 1 — the round-4 defect's fix is not pinned (BLOCKING)

- **Root cause**: check 15 runs only against today's drawer, where the two parallel smoke sessions give
  every count the value 2. Mutant **P1** restores exactly the defect round 4 found — `plural` never
  singularising, so a one-block day reads `1 blocks` — and **survives all 29 checks**, because at
  `n = 2` the app and the script's expected string agree. The code is correct today
  (`HoursView.tsx:286`); what is missing is the ability to notice if it stops being.
- **Where**: `src/renderer/src/components/HoursView.tsx:286`;
  `scripts/smoke-hours-calendar.mjs:342-356` (check 15) and `:515-522` (check 27).
- **Fix task**: **check 27 already opens the drawer on a day holding exactly one period, hence one
  group and one block** — the past-Wednesday step. Extend its `armed` probe to read
  `.hours-day-count` and assert it equals `1 folder · 1 block`. One expression, in a state the run
  already reaches, and it kills P1. (Asserting the literal expected string there is better than
  reusing check 15's DOM-derived rebuild, precisely because the singular form is what must be pinned.)
- **Priority**: Blocker — small, but it is the only thing standing between this feature and done.

### Gap 2 — spec bookkeeping reported fixed but not fixed (Non-blocking)

- `.specs/features/hours-calendar/spec.md:170` still reads **"Coverage: 26 total, 26 mapped to tasks,
  0 unmapped"**; HCAL-27 makes it 27.
- HCAL-27 moved into the P1 story ✅ but sits at `spec.md:102`, **before** HCAL-25 at `:103`, so the
  block reads 15…20, 27, 25 — still not numeric order.
- Flagged because the T19 handoff states both were done. The documents are otherwise consistent:
  the traceability table has all 27 rows and T19 is credited on HCAL-15, 25 and 27.
- **Priority**: Cosmetic, but fix it in the same pass as gap 1 so the record is true.

### Gap 3 — chip overflow and drawer side (Non-blocking — my answer to your question)

You asked whether these are blocking. **They are not**, and I would not spend a round on them:

- **Chip overflow** (HCAL-21's "SHALL be truncated"): check 10 already asserts every chip carries its
  full label as `title`, which is the half that *matters* — it is what makes a truncated label
  recoverable. The truncation itself is `overflow: hidden; text-overflow: ellipsis` on a `max-width`
  (`HoursLegend.css:18,56-62`). There is no logic behind it to regress: no branch, no computed value,
  nothing an app-side change can silently break without also changing that CSS. A mutant here would be
  a CSS edit, which is what code review and the owner's two-theme visual pass already cover.
- **Drawer side** (HCAL-15's "to the right of the grid"): check 20 already asserts the grid narrows
  when the drawer opens and takes the width back when it closes, which catches the failure mode that
  matters (an overlay instead of a split). The *side* is fixed by DOM order inside a `display: flex`
  row — to put the drawer on the left you would have to reorder the JSX or add `row-reverse`, both
  loud changes.
- Both are genuine residuals and I keep listing them for the record, but neither carries a behaviour
  that can regress silently, which is the bar the sensor sets.

### Gap 4 — the word "task" is never rendered live (Non-blocking)

- Mutant **P6** (`plural(tasks, 'task')` → `'job'`) survives, because the smoke's ad-hoc sessions run
  in non-git folders and so carry no task, leaving `tasks = 0` and that branch unrendered.
- This is the **same documented limitation** the script header already declares for HCAL-11
  ("colours of task slots … ad-hoc sessions in a non-git cwd carry no task — unit-tested instead").
  Closing it means giving the smoke a git working copy with a branch that parses to a task id, which is
  a much larger change to the harness than the bug it would catch.
- **Priority**: Minor. Worth one line in the script header's "NOT automatable here" list so the next
  Verifier does not re-derive it.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..14, 16..24, 26 | ✅ Verified | ✅ Verified — untouched by this range |
| HCAL-15 | ❌ Needs Fix (round 4) | ⚠️ **Partial** — the defect is fixed and the swatch, total, split, omission and block count are all discriminated; the singular form is not (gap 1) |
| HCAL-25 | ⚠️ Partial (round 4) | ✅ **Verified** — check 28 |
| HCAL-27 | ✅ Verified | ✅ Verified — now pinned to name its day |
| Edge cases (all 5) | ✅ Verified | ✅ Verified |

---

## Summary

**Overall**: ⚠️ One blocking item, precisely located.

**Spec-anchored check**: all four round-4 gaps closed on the code side; HCAL-25 and HCAL-27 now fully
evidenced; HCAL-15's summary clause discriminated in 5 of 7 respects
**Sensor**: 10 mutations — **8 killed, 2 survived** (P1 blocking, P6 not). Round 4's N1, N4, N5 and
round 3's MB are all now killed
**Gate**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (baseline); 893 passed, 0 failed,
0 skipped; no test file touched

**What works**: `daySummary` is correct and well built — each count pluralised on its own, tasks split
from task-less folders on the same field the label class uses, absent parts omitted; check 15 compares
against two independent sources (the column header's `aria-label` for the total, a DOM-derived rebuild
for the counts) rather than echoing the app; check 16 ties every drawer swatch to its own bar's role and
cannot pass vacuously; check 28 is correctly placed in the one part of the run where a closed period
and therefore an Edit button exist, and folds its own preconditions into the assertion.

**Issues found**: one blocker (gap 1) and three non-blocking (gaps 2–4).

**Next steps**: gap 1 is one expression added to a check that already reaches the right state — extend
check 27's `armed` probe to assert `.hours-day-count === '1 folder · 1 block'`. Fix gap 2's two lines in
the same pass. Gaps 3 and 4 need no round of their own; gap 4 belongs in the script header's
"NOT automatable here" note. This was fix→re-verify iteration 3 of 3, so the decision to run a fourth
or to accept gap 1 as a known limitation is the owner's.
