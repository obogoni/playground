# Hours Calendar — Verifier Report (round 6)

**Date**: 2026-09-19
**Spec**: `.specs/features/hours-calendar/spec.md` (HCAL-01..27 + 5 edge cases)
**Diff range**: `4e2ce9f..200147c` (`999d98b`, `200147c`)
**Verifier**: independent sub-agent (author ≠ verifier); evidence re-derived from the spec, not from `tasks.md` checkmarks or commit messages

## Validation: hours-calendar — PASS

Round 5's one blocking gap is closed, and closed at the right place. Check 27 now asserts the literal
`1 folder · 1 block` on the past-week day that holds exactly one period — the single point in the run
where every count is 1 — and **the round-4 defect, restored verbatim, dies there**. So do seven other
variants I tried, including three the fix was not specifically aimed at. Both spec bookkeeping items
landed. The gate is green at 893 with no test file and no application code touched in this range.

One mutant survives: renaming the word **"task"**. It cannot be reached, because the smoke's sessions
are ad-hoc shells in non-git folders, so no group in either fixture ever carries a task. That is the
harness limitation the script header already declares for HCAL-11, not a weak assertion — reaching it
means giving the smoke a git working copy whose branch parses to a task id, which is more harness than
the bug it would catch. It is recorded below and excluded from the tally, the way round 2 recorded M23.

**The feature is done.** Nothing blocks it.

---

## Round history

| Round | Range | Verdict | Why |
| ----- | ----- | ------- | --- |
| 1 | `c27b412..94f107d` | not done | 4 surviving mutants in `hours-calendar.ts`: M8 (axis start `floor`→`round`), M10 (lane reuse at a touching boundary), M12 / M13 (cluster closing); spec-precision gaps on HCAL-12 and the narrow-lane edge case. Lessons L-023..L-026 (`82862a0`) |
| 2 | `c27b412..be5d8ab` | done | Three unit tests added, 6 px into HCAL-12 and 64 × 36 px into the edge case. All round-1 gaps closed |
| 3 | `8b9d191..a9c98f8` | not done | Layout B (AD-031). 6 gaps: HCAL-17 evidence data-conditional (MA survived), the `hadTime` re-arm branch unevidenced (MH survived), HCAL-25 spec-precision (MB survived), drawer geometry and legend truncation code-only, `tasks.md` tables stopped at T11. Lessons L-027..L-029 (`2aff55e`) |
| 4 | `a9c98f8..a81df5b` | not done | T17 mockup pass + T18 smoke. All 6 round-3 gaps closed; MA and MH killed. New: HCAL-15's summary and swatch clauses unasserted (N1, N4, N5 survived) and the summary shipped `1 blocks`; HCAL-25's exception untested (MB survived). Lessons L-030, L-031 (`29d1ff6`) |
| 5 | `a81df5b..4e2ce9f` | not done | T19 fixes the defect and adds checks 15, 16, 28. N1, N4, N5 and MB all killed. One blocker: the fixture's counts were always 2, so restoring the defect (P1) survived all 29 checks; plus two spec items reported fixed that were not. Lesson L-032 (`999d98b`) |
| 6 | `4e2ce9f..200147c` | **done** | Check 27 pins the literal `1 folder · 1 block` on the one-period day. **Q0 (the round-4 defect verbatim), Q1 (round-5's P1) and six variants all die**; 8 of 9 killed, the ninth unreachable in the fixture. Coverage line reads 27, HCAL-27 sits after HCAL-25. Gate green at 893 |

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T19 | ✅ **Now genuinely complete** | `200147c` finishes the two Done-when boxes that round 5 found checked but untrue — "HCAL-27 sits in its own story and the coverage line reads 27" (`tasks.md:543`). No T20 was needed and none should have been added: this is the same task's remaining work, not new scope |
| Check 27 | ✅ Done | `smoke-hours-calendar.mjs:515-527`: `armed.groups === 1` (tightened from `>= 1`) and `armed.count === '1 folder · 1 block'`, with a comment stating why it is a literal rather than a rebuild. Renamed to "…counted in the singular", so the check says what it defends |
| Spec bookkeeping | ✅ Done | `spec.md:170` reads `Coverage: 27 total, 27 mapped to tasks, 0 unmapped`; the P1 block now runs 15, 16, 17, 18, 19, 20, **25, 27** — numeric |

---

## Gate Check

- **Commands** (Full gate from tasks.md): `npm run typecheck`, `npm run lint`, `npm test`, run on `200147c`
- typecheck: **exit 0**
- lint: **exit 0**, **0 errors / 18 warnings** — equals the baseline, no rise
- test: **exit 0**, **893 passed / 0 failed / 0 skipped** (55 files)
- **Test count**: 893 → 893, **delta 0**
- **Test integrity**: `git diff 4e2ce9f..200147c --stat -- '*.test.ts'` is **empty**, and so is
  `git diff 4e2ce9f..200147c --stat -- src/` — this range touches no test and **no application code at
  all**. Nothing could be weakened, and the behaviour verified in rounds 1–5 is bit-for-bit the
  behaviour verified here.

---

## Round-5 blocker — closure check

Smoke = `scripts/smoke-hours-calendar.mjs` at `200147c`, **29 checks**, numbering unchanged from round 5
(check 27 was strengthened in place, not inserted). Manual evidence = the recorded **29/29** run on
2026-09-19 with the owner's consent, whose check-27 detail read
`{"title":"…(qua)","groups":1,"count":"1 folder · 1 block"}`.

| Round-5 gap | Now | Evidence |
| ----------- | --- | -------- |
| 1 — the round-4 defect's fix was not pinned (BLOCKING) | ✅ **Closed** | `smoke-hours-calendar.mjs:515-527`. The fixture is deterministic: the script has already asserted the past week holds no time (`pastBusy === false`), parks its one period on the previous day for check 26, then moves it onto the Wednesday — so that day holds **exactly one period, hence one task-less group and one block**. `armed.count === '1 folder · 1 block'` is therefore the only correct string, and it is a **literal**, so it cannot drift with the app the way check 15's rebuild can. **Q0, Q1, Q2, Q3, Q4, Q5, Q6 and Q7 all die here** |
| 2 — spec bookkeeping reported fixed but not fixed | ✅ **Closed** | `spec.md:170` and `:102-103`, both verified by reading the file, not the diff |
| 3 — chip overflow and drawer side | ✅ **Accepted as non-blocking** | Not added, per my round-5 reading, and I stand by it: neither carries a branch or computed value that can regress without an accompanying CSS edit, and check 10 (`title` on every chip) and check 20 (grid narrows and returns) already cover the halves that can |
| 4 — the word "task" never renders live | ⚠️ **Open, non-blocking** | Mutant **Q8** survives; see the sensor and the residual note below |

### On the coverage line's silent revert

The commit body attributes round 5's false claim to a task-closing helper that rewrites the coverage
line on every run and still held `26`, so it reverted the edit each time a task was closed. The account
is self-consistent with what I found: `tasks.md:543`'s Done-when box asserted the line read 27 while
`spec.md` read 26 — exactly the signature of an edit being made and then overwritten, rather than never
made. Recording it in the commit body instead of letting the value flip unexplained is the right call,
and fixing the helper rather than the line is the right level.

Two things I could not verify and am recording rather than passing over: the helper lives outside this
repository (`grep` finds no generator for that line in the repo or in the skill's `scripts/`), so I
cannot confirm the fix; and **nothing checks that line** — `validate_state.py` does not read it. A
derived count with no check is what drifted, and it can drift again at HCAL-28. Non-blocking, and worth
one line in whatever closes tasks.

---

## Spec-Anchored Acceptance Criteria (this round's scope)

| AC | Spec-defined outcome | Evidence (`file:line` + assertion) | Outcome |
| -- | -------------------- | ---------------------------------- | ------- |
| HCAL-15 (summary) | "a summary line with the day total, **how many tasks, task-less folders and blocks it holds**, and Copy" | `HoursView.tsx:289-303` `daySummary` (unchanged this range). Check 15 (`:342-356`) on a 2-group, 2-block day: total against the selected column header's `aria-label` tail, counts against a DOM-derived rebuild. **Check 27** (`:515-527`) on the 1-group, 1-block day: `armed.count === '1 folder · 1 block'`, literal. Together they pin the singular **and** the plural, the task/folder split, the omission of an absent part, both nouns and the separator | ✅ **PASS** — 8 of 9 mutants killed; the 9th unreachable |
| HCAL-27 | Empty day → the drawer keeps its head and says so | `HoursView.tsx:232-235`; check 26 `emptyDrawer.title === wedHeader && emptyDrawer.empty === 'No time recorded on this day.' && emptyDrawer.groups === 0`. Now also correctly placed in the P1 story, in numeric order (`spec.md:103`) | ✅ PASS |
| All other ACs | — | Untouched: this range changes no application code. HCAL-01..14, 16..26 carry their rounds 2–5 evidence verbatim | ✅ PASS |

### Edge cases

All five carry forward unchanged, and the last is now the strongest of them: checks 26 → 27 → 29 walk
the selected day from **empty** (named, with its head, no groups) to **filled** (one folder, one block,
counted in the singular) to **emptied** (drawer closed, nothing selected), which is the full
`hadTime` re-arm cycle plus the summary boundary in one scenario.

**Status**: ✅ All 27 ACs and 5 edge cases evidenced; no open spec-precision gaps.

---

## Discrimination Sensor

Scratch: `git worktree add …\tmp\verify-wt6 200147c` with a `node_modules` junction. Real tree
`git status --porcelain` **empty before and after**; junction and worktree removed, `git worktree list`
back to one entry. Real sources never edited; `git stash` never used.

Judged **by reading** the smoke against the recorded 29/29 run. Every mutant was applied in the scratch
and confirmed a **compilable behaviour change invisible to the unit suite** — `tsc` exit 0 and
`vitest run src/renderer` **225/225 green for all nine**. (Q0 first failed `tsc` with TS6133 because
restoring the old JSX orphaned `daySummary`; it was re-expressed as the same rendered output through
the existing helpers so the restore is a behaviour change and not a compile error.)

**The two fixtures.** Check 15 sees today: two ad-hoc sessions, so `tasks = 0, folders = 2,
blocks = 2`. Check 27 sees the past Wednesday: one period, so `tasks = 0, folders = 1, blocks = 1`.
Between them every count takes both a singular and a plural value — which is what round 5 was missing.

| # | Line (`HoursView.tsx`) | Mutation | Rendered at check 27 | Verdict |
| - | ---------------------- | -------- | -------------------- | ------- |
| Q0 | `:289-303` | **the round-4 defect restored verbatim** — every group counted as a task, `blocks` hard-coded plural | `1 task · 1 blocks` | ✅ **Killed by 27** (and by 15) |
| Q1 | `:286` | `plural` never singularises — round 5's surviving **P1** | `1 folders · 1 blocks` | ✅ **Killed by 27** |
| Q2 | `:295-298` | singular broken for `block` only | `1 folder · 1 blocks` | ✅ Killed by 27 |
| Q3 | `:294` | singular broken for `folder` only | `1 folders · 1 block` | ✅ Killed by 27 |
| Q4 | `:294` | the word `folder` → `directory` | `1 directory · 1 block` | ✅ Killed by 27 (and by 15) |
| Q5 | `:293` | omission rule dropped for tasks | `0 tasks · 1 folder · 1 block` | ✅ Killed by 27 (and by 15) |
| Q6 | `:301` | separator `·` → `,` | `1 folder, 1 block` | ✅ Killed by 27 (and by 15) |
| Q7 | `:290` | tasks and folders swapped | `1 task · 1 block` | ✅ Killed by 27 (and by 15) |
| Q8 | `:293` | the word `task` → `job` | *not rendered* — `tasks = 0` in both fixtures | ➖ **Unreachable in the harness** (see below) |

**Sensor depth**: focused (9 mutations, all on the clause the round-5 blocker concerned)
**Sensor tally**: **8 / 8 reachable mutants killed**, 1 unreachable — ✅

**On Q8.** This is not a weak assertion; it is a fixture that cannot produce the input. Both smoke
sessions are ad-hoc `pwsh` in `C:\Windows` and `C:\Windows\System32` — non-git folders, so no period
ever carries a task id, so the `tasks > 0` branch never renders and no assertion can observe the word.
The script header already declares the same limitation for HCAL-11 ("colours of task slots … ad-hoc
sessions in a non-git cwd carry no task — unit-tested instead"). Reaching it means spawning a session
in a git working copy whose branch parses to a task id, which changes the harness far more than the
cosmetic bug it would catch. Recorded and excluded from the tally, the way round 2 recorded the
equivalent mutant M23.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code / no scope creep | ✅ — the whole range is one assertion, one probe field and two spec lines |
| Surgical changes | ✅ — no application code, no test file |
| Matches patterns | ✅ — the strengthened check keeps the section's existing `armed` probe rather than adding a second round-trip |
| Spec-anchored outcome check | ✅ — a literal expected string, at the one fixture where the boundary value occurs |
| Test independence | ✅ — and deliberately so: check 15 rebuilds from the DOM (catching count logic), check 27 hard-codes (catching formatting the rebuild would mirror). The commit comments say why. The pair is stronger than either alone |
| Every check maps to a spec requirement | ✅ — check 27 now names what it defends in its own title |
| Documented guidelines followed: `.specs/codebase/TESTING.md`, tasks.md Test Coverage Matrix | ✅ |
| Spec bookkeeping consistent | ✅ — coverage line and AC ordering both correct |

---

## Residuals (recorded, none blocking)

1. **Q8 / the word "task"** — unreachable without a git-backed fixture, as above. Worth one line in the
   script header's "NOT automatable here" list, beside the HCAL-11 note it shares a cause with, so the
   next Verifier does not re-derive it. Cosmetic.
2. **The coverage line is derived but unchecked** — nothing in the repo verifies it against the
   traceability table. It drifted once for this reason. Cosmetic.
3. **Chip overflow and drawer side** — deliberately not asserted; neither can regress silently.
   Cosmetic.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HCAL-01..14, 16..24, 26 | ✅ Verified | ✅ Verified |
| HCAL-15 | ⚠️ Partial (round 5) | ✅ **Verified** — summary discriminated at both the singular and the plural boundary |
| HCAL-25 | ✅ Verified (round 5) | ✅ Verified |
| HCAL-27 | ✅ Verified | ✅ Verified |
| Edge cases (all 5) | ✅ Verified | ✅ Verified |

**All 27 requirements verified. 0 needing fix.**

---

## Summary

**Overall**: ✅ **Ready**

**Spec-anchored check**: 27/27 ACs and 5/5 edge cases evidenced; 0 open spec-precision gaps
**Sensor**: 9 mutations — **8/8 reachable killed**, 1 unreachable in the harness (recorded)
**Gate**: typecheck exit 0; lint exit 0, 0 errors / 18 warnings (baseline); 893 passed, 0 failed,
0 skipped; no test and no application code touched in this range

**What works**: the summary clause is now pinned from both sides — check 15 rebuilds the expected
string from the DOM on a two-of-everything day, catching count logic; check 27 hard-codes
`1 folder · 1 block` on the one-of-everything day, catching the formatting a rebuild would mirror.
Eight distinct ways to break it die, including the original defect restored verbatim. Across the six
rounds every mutant that ever survived — M8, M10, M12, M13, MA, MH, MB, N1, N4, N5, P1 — is now killed,
save the one the fixture cannot reach.

**Issues found**: none blocking. Three cosmetic residuals recorded above.

**Next steps**: none required. The three residuals can ride along with any future work on this view;
none justifies a round of its own.
