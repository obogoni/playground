# Terminal Scroll & Paste Validation

## Validation: terminal-scroll-paste — PASS

**Round**: 2 of a maximum 3 (round 1 = FAIL on evidence, no code defect)
**Date**: 2026-09-17
**Spec**: `.specs/features/terminal-scroll-paste/spec.md`
**Diff range**: `fa78f78..d9b18f7` (19 commits, branch `feature/terminal-scroll-paste`)
**Verifier**: independent sub-agent (author ≠ verifier), read-only over production code and tests

**Verdict**: ✅ **PASS.** Every AC that is not an owner-accepted hand-verification item is traced to a
`file:line` assertion matching the spec-defined outcome. The seven no-evidence ACs round 1 found are now
enumerated under T14 with `file:line` and an explicit written decision, none of them reads as verified
anywhere, the one tautological assertion is replaced by a genuinely discriminating test, and 23/23
injected faults die. **One new, unaccepted item remains open** — a lint warning this round introduced
(§Gate). It is a one-line auto-fix with no behavioural effect and does not, on its own, warrant a second
FAIL; it is ranked below so it can be closed before the PR.

---

## Round 1 → Round 2 Delta

| Round-1 finding | Round-2 disposition | Verified here |
| --- | --- | --- |
| #1 TSP-23/24 no evidence | Owner decision: ship source-verified, enumerate as pending, do **not** extract a seam | ✅ enumerated with `file:line` under T14 |
| #2 TSP-02/03 no evidence | Same decision | ✅ enumerated, with the note that they bypass the tested `formatModeLog` |
| #3 TSP-16's 5 s bound + chip text unasserted | Accepted, recorded in STATE.md | ✅ recorded |
| #4 TSP-20/26/28 no evidence | Same decision | ✅ enumerated |
| #5 TSP-38 assertion tautological | **Fixed** — new `readClipboardPaste` test, two pastes under one `now` | ✅ and independently counterfactual-checked (§Sensor) |
| #6 Docs carried withdrawn IDs; STATE.md contradicted the verdict | **Fixed** — matrix IDs corrected, `design.md` struck through with a dated note, STATE.md rewritten | ✅ all three confirmed |
| #7 `validate_state.py` passes a FAIL report | Owner declined to patch the skill; orchestrator reproduced it with a synthetic report and recorded it in STATE.md | ✅ credited and recorded |

**Code changed this round**: one test file, `src/main/clipboard-reader.test.ts` (+48/−11). **No production
code touched.** Suite 819 → **820**, files 51 → 51.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T13 | ✅ Done | One commit each, `90830f3`..`02f1413` |
| T14 | ✅ Done | Owner UAT, verdict **cause 3 only**; owner-pending list now complete (13 items) |
| T15–T19 | ⏭️ Skipped | Phases 6 and 7, withdrawn by the T14 verdict |
| Fix round | ✅ Done | `d9b18f7` — one test strengthened, three documents swept |

---

## Spec-Anchored Acceptance Criteria — Round 2 Count

**34 non-withdrawn ACs**, and every one of them now falls into exactly one of three honest buckets:

| Bucket | Count | ACs |
| --- | --- | --- |
| ✅ Traced to a `file:line` assertion matching the spec-defined outcome | **26** | TSP-04..15, 17..19, 21, 27, 35..37, 39, 40, and **TSP-38 (upgraded this round)** |
| ⚠️ Partial — tested seam matches the spec, a named residue is hand-verified | **3** | TSP-01 (layout undefined by the spec), TSP-16 (error path tested; 5 s bound and chip text accepted as unasserted), TSP-22 (constant pinned, the wait itself hand-verified), TSP-25 (plan tested, `webUtils` resolution owner-confirmed) — 4 rows, 3 distinct ACs beyond TSP-25 |
| 📋 **Owner-accepted hand-verification, enumerated with `file:line`** | **7** | TSP-02, 03, 20, 23, 24, 26, 28 |

Round 1 read 27/34 matched with 7 unrecorded. Round 2 reads **26 fully matched + 1 upgraded (TSP-38) +
4 partial/precision + 7 recorded-pending, 0 silent**. The count of *tested* ACs did not go down; TSP-38
moved from "assertion exists but proves nothing" to fully matched, which is the substantive gain.

Round 1's per-AC evidence table (every `file:line` + assertion expression for all 34) stands unchanged
except for TSP-38 and is not reproduced in full here. The rows that moved:

| Criterion | Spec-defined outcome | `file:line` + assertion | Round 1 | Round 2 |
| --- | --- | --- | --- | --- |
| TSP-38 two images pasted within the same second get different PNG names | the two names differ **because a fresh suffix is drawn per paste** | `src/main/clipboard-reader.test.ts:183-209` — two `readClipboardPaste` calls under one fixed `now` with `rands: ['a1b2c3','d4e5f6']`; `:194` `expect(first).toEqual({kind:'paths',paths:[join(PASTE_DIR,'paste-20260917-184530-a1b2c3.png')]})`; `:198` same for `…-d4e5f6.png`; `:206` `expect(deps.randCalls).toBe(2)`; `:207-210` `expect(deps.writes.map(w => w.path)).toEqual([…a1b2c3.png, …d4e5f6.png])` | ⚠️ tautological | ✅ **PASS** |
| TSP-14 the PNG name's "6 hex" | `[0-9a-f]{6}` in the name | `clipboard-reader.test.ts:124` — `expect(pasteImageName(NOW,'a1b2c3')).toMatch(/^paste-\d{8}-\d{6}-[0-9a-f]{6}\.png$/)`, alongside the retained exact `:107` `toBe('paste-20260917-184530-a1b2c3.png')` | asserted only via the exact `toBe` | ✅ shape now pinned independently |

**Why the new TSP-38 test is not another tautology.** The assertion that carries it is
`expect(deps.randCalls).toBe(2)` together with two *different* full paths under an *identical* `now`. A
suffix drawn once and reused would produce two identical paths — a real collision that would overwrite
the first PNG — and would call `rand()` once. Both are asserted. This was verified by counterfactual,
not taken on trust (§Sensor).

**Residue, unchanged and accepted**: the production `rand` is `randomBytes(3).toString('hex')`
(`src/main/index.ts:333`), still in the untested shell. What the seam now proves is that
`readClipboardPaste` draws its suffix **once per paste and threads it into the name** — the part that
could plausibly have been got wrong. That `randomBytes(3).toString('hex')` yields 6 hex is true by
construction of the Node API, and it falls under the same accepted class as TSP-16's literals.

---

## Owner-Accepted Hand-Verification Items — Completeness Audit

The owner's standard for this round is "record honestly". Verifying the record, item by item, against
`tasks.md` T14:

| AC | Listed under T14? | `file:line` given? | Decision stated? |
| --- | --- | --- | --- |
| TSP-02 Ctrl+C probe line | ✅ | ✅ `TerminalPane.tsx:267` | ✅ notes it bypasses the tested `formatModeLog`, and that the owner confirmed only that `[term-modes]` lines appeared, not their contents |
| TSP-03 replay probe line | ✅ | ✅ `:332` | ✅ same |
| TSP-20 Ctrl+V and right-click share one path | ✅ | ✅ `pasteFromClipboard`, single call site | ✅ |
| TSP-23 a second paste does not interleave | ✅ | ✅ `:196`, `:205`, `:211` | ✅ **"the owner decided on 2026-09-17 to ship it source-verified rather than extract it into a tested seam"**, and names it "the most intricate new logic in the feature" |
| TSP-24 cancel on unmount / session change | ✅ | ✅ `:473-474`, `:484` | ✅ same |
| TSP-26 `dragover`/`drop` both `preventDefault` | ✅ | ✅ `:437`, `:441` | ✅ |
| TSP-28 terminal takes focus after a drop | ✅ | ✅ `:450` | ✅ |

**Complete and honest — 7/7.** The list also states *why* it exists ("Omitting them made them read as
verified in Traceability, which is the reason they are enumerated here"), which is the right framing: the
record names the failure mode, not just the items. Plus the six items T14 already carried (which agent
the paste ran against, multi-file ordering, text+image, link drop, the failure chip, the session-switch
replay gesture) — **13 hand items total**, all enumerated.

**None has crept back into reading as verified.** `spec.md`'s Requirement Traceability shows
`Implementing` for all 34 non-withdrawn IDs and `Withdrawn (Q2: cause 3 only)` for all six conditional
ones. Nothing claims `Verified`. That is neutral rather than precise — it under-claims the 26 that *are*
verified — so the per-AC status update belongs in this report's Traceability section below, which is
where `validate.md` puts it. No false positive exists in the spec.

---

## Withdrawal Consistency — Re-audit

| Where | Round 1 | Round 2 |
| --- | --- | --- |
| `spec.md` traceability rows TSP-29..34 | ✅ | ✅ unchanged |
| `spec.md` Q2 assumption row | ✅ `y`, non-reproduction stated | ✅ unchanged |
| `tasks.md` Phase 6 / Phase 7 headers | ✅ | ✅ |
| `tasks.md` T15..T19 headers | ✅ | ✅ |
| `tasks.md` coverage matrix, shared row | ❌ cited `TSP-34` | ✅ **`TSP-37`** — and correct: TSP-37 is the non-ASCII byte-for-byte edge case, covered in `paste.test.ts:9-13` and `:40-44` |
| `tasks.md` coverage matrix, renderer row | ❌ cited `TSP-29-33` | ✅ **`TSP-04/05/17 (TSP-29-33 withdrawn: Q2 verdict cause 3 only)`** |
| `design.md` | ⚠️ no marker | ✅ conditional bullet struck through + dated withdrawal note stating TSP-29..34 are `Withdrawn` and every *conditional* section below describes unimplemented design |
| `.specs/STATE.md` | ❌ said "BLOCKED ON THE OWNER at T14" | ✅ carries the verdict, the accepted gaps, the cleanup-audit outcome and the gate hole |

**Keeping the citations inside the T15..T19 bodies and the `*(conditional)*` design sections is correct,
and I agree it is not drift.** Three reasons: every one of those five task headers already reads
`**SKIPPED**, TSP-29..3x Withdrawn`; the `design.md` bullet now says in as many words that the sections
below describe a design that was never implemented; and `spec.md`'s traceability — the single normative
table — marks all six `Withdrawn`. A reader cannot reach the bodies without passing a withdrawal marker.
Deleting them would destroy the only record of what to build if the dead scroll returns, which is exactly
what the Q2 assumption row promises to preserve.

One cosmetic inaccuracy, not drift and not worth a commit on its own: the main-modules matrix row says
"every listed edge case (TSP-09, **36-39**)". TSP-35 (a copied directory pastes like a file) is also an
edge case in that layer and *is* tested, at `clipboard-reader.test.ts:158-165`. The row under-claims.

---

## Discrimination Sensor

**Isolation**: temporary `git worktree` at detached `d9b18f7`, `node_modules` junctioned to the real one.
Never `git stash`. Real-tree `git status --porcelain` captured before any sensor work: **0 bytes**.
Afterwards: worktree removed, **the junction survived `git worktree remove --force` again** (round-1
lesson reproduced) and was deleted with `(Get-Item …).Delete()` — never `Remove-Item -Recurse` on a
junction, which would walk into the real `node_modules` — then the directory removed. Post-sensor
porcelain: **0 bytes, identical to baseline**; `HEAD` still `d9b18f7`; real `node_modules` intact.

### New mutations — the changed test's discriminating power

| # | Fault | Killed? |
| --- | --- | --- |
| R1 | `rand` memoised at module scope: one suffix reused for every paste (**the mutant the new test was written for**) | ✅ Killed |
| R2 | `rand()` still called once per paste but its value discarded, name built from a constant `'a1b2c3'` | ✅ Killed |
| R3 | suffix dropped from the PNG name entirely | ✅ Killed |
| R4 | suffix truncated to 5 hex — targets the `{6}` in the new regex | ✅ Killed |
| R5 | second paste's path built from the **first** paste's suffix (a real overwrite) | ✅ Killed |
| R6 | month off-by-one in the name — re-check, because the `pasteImageName` describe block changed this round | ✅ Killed |

### Counterfactual: does the *new* test earn the kill?

Ran R1 and R2 against the **round-1** version of `clipboard-reader.test.ts` (retrieved with
`git show c569db1:…`) and against the current one, same mutated source both times:

| Mutant | vs round-1 test | vs round-2 test |
| --- | --- | --- |
| R1 memoised `rand` | ❌ **SURVIVED** — exit 0, 20 passed | ✅ **KILLED** — exit 1, 1 failed / 20 passed |
| R2 constant suffix | ❌ **SURVIVED** — exit 0, 20 passed | ✅ **KILLED** — exit 1, 1 failed / 20 passed |

The tautology is genuinely gone: the round-1 suite could not see either fault, and the round-2 suite sees
both. This is the orchestrator's claim confirmed independently, with a second mutant (R2) it had not
tried — a constant suffix that still calls `rand()` the right number of times, which defeats a
call-counter-only assertion and is caught here by the path assertions.

### Round-1 mutations, re-run verbatim

M1–M11, M13–M18 all **✅ Killed** (M12 is superseded by R6, the same month off-by-one re-verified against
the changed describe block). No previously-killed mutant became a survivor after this round's test edit.

**Sensor outcome**: **23 mutations, 23 killed, 0 survived.** Depth: escalated well past the checklist's
lightweight default, weighted onto the changed test and the load-bearing seams named in the brief
(`TerminalModeTracker` folding and split-CSI carry, `snapshot()` prefixing vs unprefixed `tail()`,
`quotePath`/`planPaste` ordering and skipping, `classifyClipboard` precedence, `selectExpired`'s strict
boundary, Ctrl+V / Alt+V / Ctrl+Alt+V classification, and now the per-paste PNG suffix).

As in round 1, the sensor can reach nothing in `TerminalPane.tsx`, so a perfect kill rate says nothing
about the seven owner-accepted items. That limit is now written into the record rather than implied.

---

## The Two Notes the Orchestrator Assessed Differently

### 1. The `gapTimer` retention claim — **I was wrong; the orchestrator is right**

Round 1 said that clearing `gapTimer` leaves the `pasteQueue` promise permanently pending and therefore
retains the disposed terminal and the unsent chunks. **That does not hold, and the mechanism is actually
inverted.**

A pending promise is not a GC root. After cleanup, React releases the effect's cleanup closure, the
effect scope becomes unreachable, and with it `pasteQueue`, the gap promise, the suspended async
continuation and `term` — all collectable. A never-settling promise leaks only while something *reachable*
still holds it: an awaiting caller on a live path, or a pending timer/IO handle. `clearTimeout` removes
precisely that handle. `gapTimer` itself holds a `number` in the renderer, not a `Timeout` object, so it
retains nothing either.

The inversion is worth stating because it flips the conclusion: **not** clearing the timer would be the
retaining case — a live timer holds `resolve`, which holds the gap promise, its reaction, the async
continuation and `term`, for up to `PASTE_GAP_MS`. The cleanup is doing the strictly better thing. Round
1's note described the opposite of the truth and is withdrawn.

### 2. The post-dispose replay callback — **severity read confirmed**

`term.write(payload.data, cb)` at `TerminalPane.tsx:330` reads `term.modes.mouseTrackingMode` and
`term.buffer.active.type` inside the callback, which xterm invokes when that chunk finishes parsing. If
the pane unmounts in between, the callback touches a disposed terminal.

Severity: **minor, debug-only — "recorded, not fixed" is the right call.** It is gated on
`replayPending = probing`, so the code path does not exist without `playground.debug.terminalModes === '1'`.
The window is the few milliseconds between the attach replay write and its parse, so it needs a session
switch essentially on mount. Worst case is a throw inside xterm's write loop on a terminal that is
already gone — no user-visible effect beyond a console error, and no PTY or data consequence.

One refinement for whenever it is touched: the guard already exists. `if (pasteDisposed) return` as the
callback's first line reuses the flag set at `:473`, costs one line and no new state. Worth doing
opportunistically, not worth a task.

---

## Gate Check

- **Command**: `npm run typecheck && npm run lint && npm test` (judged by exit code)
- **`npm run typecheck`** → exit **0**
- **`npm run lint`** → exit **0** — `✖ 19 problems (0 errors, 19 warnings)`
- **`npm test`** → exit **0** — **820 passed / 820**, **51 files passed / 51**, 0 failed, 0 skipped

**Test integrity**: 819 → 820 (+1). One test was replaced, not deleted: `pasteImageName`'s tautological
"differs for two images" became a full-spelling regex match, and TSP-38's substance moved to a new,
stronger `readClipboardPaste` test. Net assertion strength up, proven by R1/R2 counterfactual. No skips.

### ⚠️ New this round: lint warnings 18 → 19

The recorded baseline in `tasks.md:16` is "`typecheck` and `lint` exit 0 (**18** prettier warnings, 0
errors)", and round 1 measured exactly 18. This round measures **19**. The nineteenth is new and is in
this feature's own file:

```
src/main/clipboard-reader.test.ts
  30:19  warning  Replace `⏎··opts:·FakeOpts·=·{}⏎` with `opts:·FakeOpts·=·{}`  prettier/prettier
```

Cause: widening `fakeDeps`'s return type to a multi-line object type means its single parameter no longer
needs to wrap, so prettier wants the signature collapsed. The other 18 are the unchanged pre-existing
baseline in `scripts/` and `src/shared/tasks.test.ts`.

This is exit-code-invisible, which is why it is called out: judging the gate only by exit code — correct
for the 18 known warnings — hides that the count moved. It is not a coverage, evidence or behaviour gap,
and it is not an item the owner accepted; it is a formatting nit plus a now-stale number in `tasks.md`.
Fix is `npx eslint --fix src/main/clipboard-reader.test.ts` (or accept 19 and update `tasks.md:16`).

### Closing gate — the hole, still open by decision

`python scripts/validate_state.py terminal-scroll-paste` → exit **0** for this PASS report, and the
verdict it reads is the real one because this report's heading is `## Validation: terminal-scroll-paste —
PASS`.

The round-1 defect is unfixed by owner decision and remains true: `_verdict()` builds its haystack only
from lines matching `^#{1,4}\s*validation\b` or an unanchored `\*{0,2}result\*{0,2}\s*:`, so a report
whose verdict lives in prose or in `## Summary` is decided by the Discrimination Sensor's own
`Result:` line — which `validate.md`'s template prescribes with a pass/fail marker for the *sensor*.
The orchestrator reproduced this with a synthetic report (`**Verdict: FAIL**` → exit 0) and recorded it in
`.specs/STATE.md`. This report deliberately avoids a section-level `Result:` label and states the verdict
in a matching heading. **Any future report following the template literally is still exposed.**

---

## Code Quality

| Principle | Status |
| --- | --- |
| No features beyond what was asked | ✅ |
| No abstractions for single-use code | ✅ — `rands?: string[]` and `randCalls` are test-fixture plumbing, used by the one test that needs them |
| No unnecessary flexibility | ✅ — the `rands` fallback (`?? opts.rands[length-1]`) means an over-calling mutant is caught rather than crashing the fixture, which is deliberate |
| Only touched files required | ✅ — one test file plus three documents |
| Didn't "improve" unrelated code | ✅ — no production code touched this round |
| Matches existing patterns/style | ⚠️ one new prettier warning in the touched test file (§Gate) |
| Would a senior engineer approve? | ✅ — the replacement test asserts the property that matters (a fresh draw per paste) rather than the shape of a string, and the fixed `now` is what makes the test meaningful. The counterfactual confirms it earns its place |
| Spec-anchored outcome check | ✅ 26 fully matched, 4 partial/precision, 7 owner-accepted and enumerated, **0 silent** |
| Per-layer Coverage Expectation met | ✅ pure seams 1:1; matrix rows now cite live IDs (one under-claim, TSP-35) |
| Every test maps to a spec requirement | ✅ the new test cites TSP-38; the retitled one cites TSP-14. 4 uncited tests remain, all negative controls tracing to TSP-08, TSP-12/13, the format-gating assumption and TSP-19 |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md` (hand-rolled DI fakes, real temp dirs), `CONVENTIONS.md`, `vitest.config.ts` |

---

## Edge Cases

- [x] TSP-35 copied directory pastes like a file — `clipboard-reader.test.ts:158-165`
- [x] TSP-36 blank lines / trailing CRLF ignored — `:87-90`, `:100-101`
- [x] TSP-37 non-ASCII byte for byte — `paste.test.ts:11-12` (with a `slice(1,-1)` round-trip), `:42-43`
- [x] TSP-38 two images in one second differ — **upgraded this round**, `clipboard-reader.test.ts:183-209`
- [x] TSP-39 a file exactly 7 days old is kept — `paste-temp.test.ts:29,32` and `:67` against a real filesystem
- [x] TSP-40 agent owns the mouse, nothing selected → no paste — `terminal-keys.test.ts:217`

---

## Requirement Traceability Update

`spec.md` currently shows `Implementing` for all 34 non-withdrawn IDs. Proposed statuses on close
(the spec file is outside this report's write scope):

| Requirement | Previous | New |
| --- | --- | --- |
| TSP-01 | Implementing | ⚠️ Verified, spec-precision gap (line layout undefined by the spec) |
| TSP-02, TSP-03 | Implementing | 📋 Owner-accepted hand-verification — enumerated under T14 |
| TSP-04..TSP-15 | Implementing | ✅ Verified |
| TSP-16 | Implementing | ⚠️ Verified for the error path; 5 s bound and chip text accepted as unasserted |
| TSP-17..TSP-19 | Implementing | ✅ Verified |
| TSP-20 | Implementing | 📋 Owner-accepted hand-verification |
| TSP-21 | Implementing | ✅ Verified |
| TSP-22 | Implementing | ⚠️ Constant verified; the wait is hand-verified |
| TSP-23, TSP-24 | Implementing | 📋 Owner-accepted, shipping source-verified by written decision |
| TSP-25 | Implementing | ⚠️ Plan verified; `webUtils` resolution owner-confirmed |
| TSP-26 | Implementing | 📋 Owner-accepted hand-verification |
| TSP-27 | Implementing | ✅ Verified |
| TSP-28 | Implementing | 📋 Owner-accepted hand-verification |
| TSP-29..TSP-34 | Withdrawn | ⏭️ Withdrawn — consistent across `spec.md`, `tasks.md`, `design.md`, `STATE.md` |
| TSP-35..TSP-37 | Implementing | ✅ Verified |
| TSP-38 | Implementing | ✅ **Verified** (was ⚠️ tautological in round 1) |
| TSP-39, TSP-40 | Implementing | ✅ Verified |

---

## Ranked Open Items

1. **Lint warnings 18 → 19** (Minor, new this round, not an accepted gap). `src/main/clipboard-reader.test.ts:30`,
   `prettier/prettier`. Either `npx eslint --fix src/main/clipboard-reader.test.ts` or update the recorded
   baseline at `tasks.md:16` from 18 to 19. Both are one line; the first is preferable.
2. **`spec.md` Traceability still reads `Implementing` for all 34** (Cosmetic). Apply the table above so
   the spec distinguishes the 26 verified from the 7 owner-accepted pending. Under-claims today, so
   nothing is falsely green.
3. **Coverage matrix under-claims TSP-35** (Cosmetic). The main-modules row says "TSP-09, 36-39"; TSP-35
   is in that layer and is tested. Fold into item 2's commit if one is made.
4. **The post-dispose replay callback** (Cosmetic, recorded not fixed by decision). One-line guard
   available if the file is touched for another reason.

No item above is a coverage, evidence or behaviour gap. Items 2–4 are records and hygiene; item 1 is the
only one introduced by this round.

---

## Summary

**Overall**: ✅ **Ready**

**Spec-anchored check**: 26/34 fully matched, 4 partial or spec-precision, **7 owner-accepted
hand-verification items enumerated with `file:line` and a written decision, 0 silent passes**.
**Sensor**: **23 mutations, 23 killed, 0 survived**, plus a counterfactual proving the new test — not a
pre-existing assertion — is what kills the cached-suffix mutant. Scratch discarded; real tree porcelain
empty and identical to the pre-sensor baseline.
**Gate**: typecheck 0, lint 0, test 0 — 820/820 passing, 51/51 files, 0 skipped. Lint warnings 18 → 19
(§Gate).

**What earns the PASS**: round 1's FAIL was about evidence, not behaviour, and every one of its findings
has been either fixed or recorded with the precision the owner asked for. The seven no-evidence ACs are
now impossible to mistake for verified — they are named, located, and the decision to ship them
source-verified is in writing with the reason. The one genuinely weak assertion is gone, and its
replacement is the only test in this feature whose discriminating power was proven by running the old
test against the same mutant and watching it pass. The pure seams remain the best-covered code in the
diff: exhaustive over the split offset for TSP-09, both sides of the 7-day boundary for TSP-39, precedence
*and* absent side effects for TSP-12/13, and prefix-present-in-snapshot-yet-absent-from-tail for TSP-11.

**What the PASS does not claim**: nothing has been verified about `TerminalPane.tsx`. The paste queue's
serialization and its cancel-on-session-change (TSP-23/24) ship on source review alone. That is the
owner's accepted risk, taken with the risk named rather than hidden, and the sensor's perfect kill rate
does not extend to it.

**Next steps**: close item 1 (one line), optionally items 2–3 in the same commit, then push and PR.
