# Session Activity Notifications Validation — Rounds 1–4

## Round 2 verdict: PASS ✅ (NOTF-01..29; superseded by round 3 for the rev4 increment)

**Date**: 2026-09-16
**Spec**: `.specs/features/session-idle-notifications/spec.md` (29 ACs, NOTF-01..29)
**Diff range**: `65de9fd..HEAD` (`b3a00b3`), 19 commits; feature code from `2e6bf64`; fix round 1 = `b3a00b3`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree
**Round**: re-verification 2 of a maximum 3. Round 1 (at `40ab12f`) returned ❌ FAIL on evidence only.
**Round 2 outcome**: PASS — every round-1 evidence gap is closed or accepted under the project convention;
the only open item is the owner-run smoke, owner-pending by design.

---

## What round 2 re-derived (not inherited)

- `git diff --stat 40ab12f b3a00b3 -- src` is **empty**: the fix touched only
  `scripts/smoke-notifications.mjs`, `spec.md` and `tasks.md`. The unit-test evidence and the
  sensor result of round 1 therefore still describe the shipped code byte for byte; the gates
  were re-run anyway.
- Each new smoke check was read against the real component and IPC code to confirm its selectors
  resolve and that its **start state differs from the asserted end state**, so it can fail.
- Each spec addition was checked against the code it describes.

---

## Round-1 gap disposition

| # | Round-1 gap | Status | Proof |
| - | ----------- | ------ | ----- |
| 1 | **NOTF-23** no evidence (Major) | ✅ **CLOSED** (smoke, owner-pending run) | `scripts/smoke-notifications.mjs:607` asserts the setup `status === 'stopped' && direction === 'Tree' && notice === 1`; `:615` clicks the notice; `:631` asserts `opened2.selected === TITLE_A`. Start state: the selected session is B (selected at `:536`, step 6) and A is stopped, so a broken open leaves B selected → the check fails. `sessions:stop` exists (`src/shared/ipc-contract.ts:92`, `src/main/index.ts:346`); its errors are swallowed at `:592`, but the setup check at `:607` would then fail loudly rather than pass falsely |
| 2 | **NOTF-05** direction half could not fail (Minor) | ✅ **CLOSED** (smoke, owner-pending run) | `:607` pins the start direction to `Tree`; `:626` asserts `opened2.direction === 'Agents'`. Selectors match `src/renderer/src/components/TopBar.tsx:99,119` (`topbar-segment` + `active`, labels `Tree`/`Agents`). Start ≠ end, so it can fail |
| 3 | **NOTF-06** no verification step (Minor) | ✅ **ACCEPTED** as code reading | Named in the smoke header "CODE READING ONLY" (`scripts/smoke-notifications.mjs:30-33`). Guard verified at `src/main/index.ts:256` `if (!Notification.isSupported()) return` — before any `Notification` is constructed. `.specs/codebase/TESTING.md:43,67` exempts thin Electron shells from unit tests and hand-verifies them; an unsupported-OS condition is not reachable on the project's Windows desktop, so a one-line guard read at its `file:line` is the strongest evidence the convention allows |
| 4 | **NOTF-21** no verification step (Minor) | ✅ **ACCEPTED** as code reading | Header `:34-36`. Verified all three legs of the claim: `revealWindow` returns on a missing/destroyed window (`src/main/index.ts:237`); `emitToWindow` returns on a null window (`:231`) and `mainWindow` is nulled on `closed` (`:153-154`); `window-all-closed` quits on non-darwin (`:465-472`), so on Windows a click cannot outlive the window. Same TESTING.md basis as #3 |
| 5 | **NOTF-29** agent-form half unexercised (Minor) | ✅ **CLOSED** (smoke, owner-pending run) | `:246-272` opens `.set-agent-add` (`SettingsDialog.tsx:426`), types into `.set-agent-form input` — whose first input is the name field (`SettingsDialog.tsx:367-372`) — round-trips the tabs, asserts `formKept === FORM_NAME` (`:268`). Start state is "no form" (`null`), so losing the form fails the check. Checked for a side effect: the later dialog close at `:353-357` clicks the first `Cancel` ghost button while the Notifications tab is shown, so the agent form's own `Cancel` (`SettingsDialog.tsx:406-411`) is unmounted and cannot be clicked by mistake |
| 6 | Owner smoke never run | ⏳ **OWNER-PENDING** (by design, not a round failure) | `scripts/smoke-notifications.mjs` is owner-run against a live app, never in CI (`.specs/codebase/TESTING.md:9,70`). Consistent with `session-activity-status`, whose PASS carried the same open owner action |
| SP-1 | Body wording not pinned by spec | ✅ **CLOSED** | `spec.md:71` pins title `<agent> · <title>` and all six body strings; they match `src/main/activity-notification.ts:55-60` and the assertions at `src/main/activity-notification.test.ts:109,116,122,126,130,136` exactly |
| SP-2 | NOTF-19 assumption row `n` | ✅ **CLOSED** | `spec.md:63` now `y` ("Accepted with the Design approval") |
| SP-3 | "Attached" undefined outside agents | ✅ **CLOSED** | `spec.md:67` defines it as the session whose terminal is mounted in the agents direction. Verified true in code: `TerminalPane` is rendered only by `AgentsView` (`src/renderer/src/components/AgentsView.tsx:248`), it invokes `sessions:attach` on mount (`TerminalPane.tsx:206`) and `sessions:detach` on unmount (`TerminalPane.tsx:310`), and `SessionManager.detach` clears `#activeId` (`src/main/session-manager.ts:219-220`) |

**Residual risk (noted, not a gap)**: step 8 relies on the in-app notice still being up when it is
clicked; notices auto-dismiss after 8 s (`SessionNotices.tsx:8`). A slow run would make the setup
check at `:607` fail — a false FAIL, never a false PASS.

---

## Spec-Anchored Acceptance Criteria (round 2)

Rows unchanged from round 1 keep their round-1 evidence (see history below); source and unit tests
are identical at `b3a00b3`.

| ID | Result round 1 | Result round 2 | Evidence added |
| -- | -------------- | -------------- | -------------- |
| NOTF-01..04, 07..15, 17, 22, 24..27 | ✅ PASS | ✅ PASS | — (unit assertions, unchanged) |
| NOTF-16, 18, 19 (write), 20, 28 | ✅ smoke (planned) | ✅ smoke (owner-pending) | — |
| NOTF-05 | ⚠️ Partial | ✅ PASS (main unit `src/main/session-notifier.test.ts:82,83` + smoke `scripts/smoke-notifications.mjs:626,631`) | step 8 |
| NOTF-06 | ❌ GAP | ✅ code reading (`src/main/index.ts:256`) per TESTING.md thin-shell convention | header |
| NOTF-21 | ❌ GAP | ✅ code reading (`src/main/index.ts:237,231,153,465`) per TESTING.md thin-shell convention | header |
| NOTF-23 | ❌ GAP | ✅ smoke `scripts/smoke-notifications.mjs:607,631` (owner-pending) | step 8 |
| NOTF-29 | ⚠️ Partial | ✅ smoke `scripts/smoke-notifications.mjs:244,268` (owner-pending) | form round trip |

**Status**: ✅ 29/29 ACs carry `file:line` evidence of the kind the project's convention requires
for their layer. 0 spec-precision gaps remain.

---

## Discrimination Sensor

Not re-run: production code and unit tests are unchanged since round 1 (`git diff --stat 40ab12f
b3a00b3 -- src` empty), so the round-1 result applies verbatim — **20/20 non-equivalent mutants
killed**, M7 equivalent (proven by M7d). Full table in the round-1 history below. The new smoke
checks cannot be mutation-tested without a live app; their discrimination was checked statically
(start state ≠ asserted end state, table above).

---

## Gate Check (round 2, real tree at `b3a00b3`, judged by exit code)

| Gate | Command | Exit | Detail |
| ---- | ------- | ---- | ------ |
| Typecheck | `npm run typecheck` | **0** | — |
| Lint | `npm run lint` | **0** | 0 errors, 18 pre-existing warnings |
| Tests | `npm test` | **0** | **990 passed / 56 files**, 0 failed, 0 skipped |

Test count unchanged from round 1 (the smoke is not in the suite); baseline 917 → 990 (+73), no deletions.

---

## Lessons

The three candidates recorded in round 1 (L-019, L-020, L-021) stay: they were distilled from real
round-1 failures and remain correct general rules. The fix round applied exactly those rules (named
code-reading lines, a start state that differs, wording pinned in the spec), which corroborates
rather than invalidates them. Round 2 has no new signal, so nothing new is recorded.

---

## Summary

**Overall**: ✅ Ready (pending the owner's smoke run, by design)

**Spec-anchored check**: 29/29 ACs evidenced; 0 spec-precision gaps
**Sensor**: 20/20 non-equivalent mutants killed (round 1, code unchanged)
**Gate**: typecheck 0, lint 0, tests 0 (990 passed)

**Next steps**: owner runs `npm run dev -- -- --remote-debugging-port=9222` then
`node scripts/smoke-notifications.mjs`, plus the header's hand-verify items; a failing check there
reopens the corresponding AC.

---

## History — Round 1 (at `40ab12f`, superseded)

### Round 1 verdict — FAIL ❌ (superseded)

**Date**: 2026-09-16
**Spec**: `.specs/features/session-idle-notifications/spec.md` (29 ACs, NOTF-01..29)
**Diff range**: `65de9fd..HEAD` (`40ab12f`), 18 commits; feature code from `2e6bf64`; branch `feature/session-idle-notifications`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over the real tree; mutations in a detached scratch worktree
**Round**: 1 of a maximum 3

**Verdict**: ❌ **FAIL**, on evidence and not on behaviour. All the decision logic is covered, the
tests tell right from wrong (every non-equivalent mutant was killed) and every gate exits 0. The
failure is evidence-or-zero on the Electron/renderer side: **NOTF-23**, **NOTF-06** and **NOTF-21** have
no assertion **and** no hand-verify line, and the smoke check cited for the "switch to the agents
direction" half of **NOTF-05** can't catch a regression because it never leaves that direction.
Every gap is Minor to Major and cheap to close: smoke/hand-verify additions only, no production code
change needed. The owner smoke hasn't run yet, so each "smoke" row below is a planned check, not
observed evidence.

---

### R1 · Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 config switches | ✅ Done | `src/shared/config.ts:81-89`, five flat optional booleans; `DEFAULT_CONFIG` untouched |
| T2 `readNotificationPrefs` | ✅ Done | 10 tests |
| T3 IPC events | ✅ Done | `src/shared/ipc-contract.ts:141,143` |
| T4 decide + describe | ✅ Done | 43 tests |
| T5 `SessionNotifier` | ✅ Done | 7 tests |
| T6 `onActivityChange` | ✅ Done | 7 tests; the 43 older SessionManager tests are unmodified in the diff |
| T7 Electron wiring | ✅ Done | build-gated; hand-verify list incomplete (see gaps) |
| T8 notice list | ✅ Done | 6 tests |
| T9 `SessionNotices` | ✅ Done | build-gated, smoke |
| T10 App subscriptions | ✅ Done | build-gated, smoke (partial, see gaps) |
| T11 settings tabs | ✅ Done | build-gated, smoke |
| T12 switches | ✅ Done | build-gated, smoke |
| T13 owner smoke | ⚠️ Written, **not run** | owner action; needs a live app |

---

### R1 · Spec-Anchored Acceptance Criteria

AN = `src/main/activity-notification.test.ts`, SN = `src/main/session-notifier.test.ts`,
NS = `src/shared/notifications.test.ts`, SM = `src/main/session-manager.test.ts`,
NO = `src/renderer/src/lib/session-notices.test.ts`, SMOKE = `scripts/smoke-notifications.mjs`.
`describe.each(NOTIFIABLE_STATES)` at AN:22 runs each AN:25-59 case for all four notifiable states.

| ID | Criterion (short) | Spec-defined outcome | `file:line` + assertion | Result |
| -- | ----------------- | -------------------- | ----------------------- | ------ |
| NOTF-01 | unfocused, enters needs-approval/needs-input → OS notification | OS surface, one notification | `src/main/activity-notification.test.ts:26` `toBe('os')`; `src/main/session-notifier.test.ts:72` `shown…toEqual([{ title, body }])` + `:75` `emitted toEqual([])` | ✅ PASS |
| NOTF-02 | focused, not attached → in-app toast | in-app surface | `src/main/activity-notification.test.ts:30` `toBe('in-app')`; `src/main/session-notifier.test.ts:89-90` no `showOs`, one `session:notice` with exact payload; SMOKE:483 notice text (planned) | ✅ PASS |
| NOTF-03 | focused + attached → no notification | none | `src/main/activity-notification.test.ts:34` `toBeNull()`; `src/main/session-notifier.test.ts:102-103` | ✅ PASS |
| NOTF-04 | body names the tool | tool name in body | `src/main/activity-notification.test.ts:109` `toEqual({ title, body: 'Needs approval to run Bash' })`. `needs-input` never carries a tool (`src/main/activity-machine.ts:100,132`), so the approval case is the only one | ✅ PASS |
| NOTF-05 | click → show + focus window, agents direction, select session | reveal, then focus event for that id; renderer switches direction and selects | Main: `src/main/session-notifier.test.ts:82` `calls toEqual(['reveal','emit:session:focus'])`, `:83` payload `{ id: 's1' }`. Renderer: SMOKE:492 selected row (planned); **direction half has no check that can fail** (`src/renderer/src/App.tsx:172-173`, code only) | ⚠️ Partial (gap 2) |
| NOTF-06 | OS unsupported → skip without error | nothing shown, no throw | `src/main/index.ts:256` `if (!Notification.isSupported()) return`: code only. **No assertion, not in the smoke hand-verify list** (SMOKE:19-29) | ❌ GAP (gap 3) |
| NOTF-07 | unfocused, enters waiting → OS | OS surface | `src/main/activity-notification.test.ts:26` (state `waiting`) `toBe('os')` | ✅ PASS |
| NOTF-08 | unfocused, enters error → OS naming error type | OS + `rate_limit` in body | `src/main/activity-notification.test.ts:26` (state `error`) `toBe('os')`; `:130` `body toBe('Turn failed: rate_limit')` | ✅ PASS |
| NOTF-09 | focused, not attached, waiting/error → in-app | in-app surface | `src/main/activity-notification.test.ts:30` (states `waiting`, `error`) `toBe('in-app')` | ✅ PASS |
| NOTF-10 | enters working/compacting/exited → never | none, both surfaces | `src/main/activity-notification.test.ts:67,70` `toBeNull()` for each of the three | ✅ PASS |
| NOTF-11 | no activity state → never | none | `src/main/activity-notification.test.ts:75` `after: null → toBeNull()` | ✅ PASS |
| NOTF-12 | names agent and title | `agent · title`, no doubled prefix | `src/main/activity-notification.test.ts:140` `toBe('Claude · feature-login')`, `:145` renamed → `'Claude · Fix login redirect'`; `src/main/session-manager.test.ts:711` renamed title reported | ✅ PASS |
| NOTF-13 | master off → neither surface | none, both surfaces | `src/main/activity-notification.test.ts:44,45` `toBeNull()` unfocused and focused-elsewhere; `src/main/session-notifier.test.ts:110` | ✅ PASS |
| NOTF-14 | state switch off → neither surface for that state | none for that state, others still notify | `src/main/activity-notification.test.ts:50,51` `toBeNull()`, `:54` the other three `toBe('os')`; SMOKE:509 (planned) | ✅ PASS |
| NOTF-15 | master on + state on → notifies as P1/P2 | as P1/P2 | `src/main/activity-notification.test.ts:26,30` with `ALL_ON` prefs; `:54` | ✅ PASS |
| NOTF-16 | toggle persists immediately via `config:patch` | persisted value readable via `config:get` | SMOKE:281 `notifyWaiting === false && notify === true && …`, SMOKE:293 master persisted (renderer, smoke by convention) | ✅ smoke (planned) |
| NOTF-17 | absent switch → on | all five true | `src/shared/notifications.test.ts:31` `toEqual(ALL_ON)` for a `ui` without keys | ✅ PASS |
| NOTF-18 | one switch per notifiable state | master + 4 labelled switches | SMOKE:265 exact label list | ✅ smoke (planned) |
| NOTF-19 | master off→on keeps state switches | state values unchanged | Read side: `src/shared/notifications.test.ts:47,54`. Write side: SMOKE:293 `notifyWaiting === false` after master off; SMOKE:309 checked list restored | ✅ PASS (read) + smoke (write) |
| NOTF-20 | master off → state switches disabled | `disabled` on all four, values kept | SMOKE:298 `every((c) => c.disabled)` + values `[true,true,false,true]` | ✅ smoke (planned) |
| NOTF-21 | window destroyed at click → ignore | no-op, no throw | `src/main/index.ts:237` `if (!mainWindow \|\| mainWindow.isDestroyed()) return`: code only. **No assertion, not in the hand-verify list** | ❌ GAP (gap 4) |
| NOTF-22 | several at once → one per session | one notification per session id | `src/main/session-notifier.test.ts:124` two distinct notifications, `:136` each click emits its own id; `src/renderer/src/lib/session-notices.test.ts:15,21` stack/replace; `src/main/session-manager.test.ts:722` `toHaveLength(1)` on an unchanged view | ✅ PASS |
| NOTF-23 | session stopped before click → still selected | selects the stopped session | `src/renderer/src/App.tsx:174` `setSelectedSessionId(id)` has no running guard: code only. **No assertion, no smoke check, not in the hand-verify list** | ❌ GAP (gap 1) |
| NOTF-24 | minimized → treated as unfocused, OS | OS surface | Decision: `src/main/activity-notification.test.ts:39` unfocused + attached `toBe('os')`. Wiring `src/main/index.ts:245` `!isMinimized()`; hand-verify listed at SMOKE:25 | ✅ PASS + hand-verify |
| NOTF-25 | needs-approval → working → no notify | none | `src/main/activity-notification.test.ts:82` `toBeNull()` | ✅ PASS |
| NOTF-26 | PTY stops while notifiable → no notify | no transition reported | `src/main/session-manager.test.ts:735` `toEqual(['working','needs-approval'])` after `emitExit` + `stop` | ✅ PASS |
| NOTF-27 | first activity event → no notify | none | `src/main/activity-notification.test.ts:59` `before: null → toBeNull()` for all four states; SMOKE:470 (planned) | ✅ PASS |
| NOTF-28 | General + Notifications tabs, opens on General | active tab `General`, title `Azure DevOps, agents & shell` | SMOKE:191 `opened.active === 'General' && opened.title === …` | ✅ smoke (planned) |
| NOTF-29 | tab switch keeps unsaved General edits **and an open agent form** | both survive | SMOKE:236 `kept === EDIT` covers the template edit only. The agent-form half is untested; the state does sit above the tabs (`src/renderer/src/components/SettingsDialog.tsx:87` `form`, `:91` `tab`) | ⚠️ Partial (gap 5) |

**Status**: ❌ Gaps present: 3 ACs with zero evidence (NOTF-06, NOTF-21, NOTF-23), 2 with half their
criterion unevidenced (NOTF-05, NOTF-29). 24/29 fully evidenced; 7 of those rest partly or wholly on
a smoke that hasn't run.

### Spec-precision gaps (⚠️ flagged, non-blocking)

- **Body wording outside NOTF-04/08.** The spec asks for "the state, plus the detail". It doesn't
  pin the text for `needs-input`, `waiting`, or approval/error with no detail. The assertions at
  `src/main/activity-notification.test.ts:116,122,126,136` pin wording from the design
  (`Needs your input`, `Finished its turn`, …), not from the spec. That's correct for the design,
  but the spec has no outcome to anchor to.
- **NOTF-19 is an AC whose assumption row is still `Confirmed? n`** (spec, "Master off keeps the
  state choices"). It is implemented and evidenced, but the owner hasn't confirmed the behaviour.
- **"Attached" isn't defined for directions other than agents.** NOTF-03 is anchored to
  `SessionManager.#activeId` (`src/main/session-manager.ts:359`). The spec doesn't say whether a
  session stays attached while the user looks at the tree/board/workflows direction, where its
  terminal isn't on screen.

---

### R1 · Edge Cases

- [ ] Window destroyed at click (NOTF-21): the guard exists at `src/main/index.ts:237`, but nothing verifies it
- [x] Several sessions at once (NOTF-22): `src/main/session-notifier.test.ts:124,136`
- [ ] Session stopped before click (NOTF-23): code path looks right (`src/renderer/src/App.tsx:174`), but nothing verifies it
- [x] Minimized is unfocused (NOTF-24): `src/main/activity-notification.test.ts:39` + `src/main/index.ts:245` + hand-verify SMOKE:25
- [x] Answered approval → working (NOTF-25): `src/main/activity-notification.test.ts:82`
- [x] PTY stops while blocked (NOTF-26): `src/main/session-manager.test.ts:735`, mutant M15 killed
- [x] First event is notifiable (NOTF-27): `src/main/activity-notification.test.ts:59`, mutant M1 killed

---

### R1 · Discrimination Sensor

Scratch: `git worktree add <scratchpad>/verify-wt HEAD` (detached `40ab12f`), `node_modules` by
junction. Each mutant was applied by exact-anchor replacement, run against its test files with
`npx vitest run <files>`, and restored in `finally`. The unmutated scratch baseline was 5 files /
116 tests, exit 0.

| # | File:line | Mutation | Tests run | Killed? |
| - | --------- | -------- | --------- | ------- |
| M1 | `src/main/activity-notification.ts:44` | drop `if (before === null) return null` | AN+SN | ✅ Killed (4 failed) |
| M2 | `src/main/activity-notification.ts:46` | drop the same-state rule | AN+SN | ✅ Killed (1) |
| M3 | `src/main/activity-notification.ts:49` | swap `'in-app'` / `'os'` | AN+SN | ✅ Killed (23) |
| M4 | `src/main/activity-notification.ts:47` | ignore the per-state switch | AN+SN | ✅ Killed (4) |
| M5 | `src/main/activity-notification.ts:47` | ignore the master switch | AN+SN | ✅ Killed (5) |
| M6 | `src/main/activity-notification.ts:48` | drop the focused+attached exemption | AN+SN | ✅ Killed (5) |
| M7 | `src/main/activity-notification.ts:36` | `isNotifiable` → `state !== 'working'` | AN+SN | ⚪ Survived, **equivalent** (see below) |
| M7d | `src/main/activity-notification.ts:41,47` | drop the notifiable guard **and** read the switch as `=== false` | AN+SN | ✅ Killed (4) |
| M8 | `src/main/activity-notification.ts:55` | drop the tool from the approval body | AN+SN | ✅ Killed (4) |
| M9 | `src/main/activity-notification.ts:59` | drop the error type from the body | AN | ✅ Killed (1) |
| M10 | `src/main/activity-notification.ts:70` | no agent prefix on a renamed title | AN+SN | ✅ Killed (1) |
| M11 | `src/shared/notifications.ts:36` | absent switch treated as off | NS | ✅ Killed (7) |
| M12 | `src/main/session-manager.ts:359` | `attached` inverted | SM | ✅ Killed (2) |
| M13 | `src/main/session-manager.ts:347` | listener called on unchanged views | SM | ✅ Killed (1) |
| M14 | `src/main/session-manager.ts:357` | report `after` as `before` | SM | ✅ Killed (2) |
| M15 | `src/main/session-manager.ts:335` | `#finalize` routes the PTY stop through `#setActivity` | SM | ✅ Killed (1) |
| M17 | `src/main/session-notifier.ts:45` | emit `session:focus` before `reveal` | SN | ✅ Killed (1) |
| M18 | `src/main/session-notifier.ts:46` | `session:focus` with the wrong id | SN | ✅ Killed (2) |
| M19 | `src/main/session-notifier.ts:45` | drop `reveal()` on click | SN | ✅ Killed (1) |
| M20 | `src/renderer/src/lib/session-notices.ts:12` | `upsertNotice` appends instead of replacing | NO | ✅ Killed (1) |
| M21 | `src/renderer/src/lib/session-notices.ts:18` | `dropNotice` keeps only the named id | NO | ✅ Killed (2) |

**M7 is equivalent, not a weak test.** After the guard, `prefs.states[after.state]` is `undefined`
for any non-notifiable state, and `!undefined` returns `null`. So the per-state lookup is a second
allow-list, and weakening `isNotifiable` alone changes no observable behaviour. The same holds for
dropping the guard entirely (M7b), which typecheck would also reject. The probe **M7d** removes both
allow-lists at once, the way a plausible "absent = on" refactor of the lookup would, and the NOTF-10
tests at `src/main/activity-notification.test.ts:67,70` kill it.

**Sensor depth**: expanded (≥5 behaviour-level mutations across all four decision modules)
**Sensor result**: 20/20 non-equivalent mutants killed; 1 equivalent mutant (M7) shown equivalent by M7d

---

### R1 · Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ Five small modules; no speculative options |
| Surgical changes | ✅ `session-manager.ts` +15 lines in `#setActivity`; `index.ts` refactor limited to sharing `showOs`/`revealWindow` with the workflow toast |
| No scope creep | ✅ Holding each `Notification` in a Set until click, close or failure fixes a GC issue the design flagged under Risks, not an addition |
| Matches patterns | ✅ DI + hand-rolled fakes (TESTING.md pattern 3), co-located tests, persist-on-change like `defaultShell` |
| Spec-anchored outcome check | ✅ for the logic layer; ⚠️ 3 spec-precision gaps flagged above |
| Per-layer coverage (matrix in tasks.md) | ⚠️ Pure/DI layers 1:1 with ACs; wiring/renderer hand-verify list incomplete (gaps 1-5) |
| Every test maps to a requirement | ✅ Unlabelled tests map to Done-when items (detail-only change, blocked → error, no-tool/no-error wording, non-mutation, throwing listener) |
| Documented guidelines followed | ✅ `.specs/codebase/TESTING.md`, `.specs/codebase/CONVENTIONS.md` |

Observation (not a gap): `session-manager.test.ts:714` is labelled NOTF-22, but it asserts the
ACTV-06 idempotency that the spec relies on. The label is misleading; the assertion is right.

---

### R1 · Gate Check

Run from the repo root on the real tree at `40ab12f`, judged by exit code:

| Gate | Command | Exit | Detail |
| ---- | ------- | ---- | ------ |
| Typecheck | `npm run typecheck` | **0** | — |
| Lint | `npm run lint` | **0** | 0 errors, 18 warnings (pre-existing, as expected) |
| Tests | `npm test` | **0** | **990 passed / 56 files**, 0 failed, 0 skipped |

- **Test count before feature**: 917 tests / 52 files (tasks.md baseline)
- **Test count after feature**: 990 tests / 56 files
- **Delta**: +73 tests (NS 10 + AN 43 + SN 7 + SM 7 + NO 6 = 73, which matches exactly), +4 files. No deletions.
- The orchestrator's brief said 57 files; the measured count is **56**. The test count matches.
- `npx electron-vite build` was not re-run by the Verifier; the build gate in tasks.md lists it only at phase ends, and typecheck covers the type surface.

---

### R1 · Fix Plans

### Fix 1 (Major): NOTF-23 has no evidence

- **Root cause**: nothing checks selecting a session that was stopped after its notification.
- **Fix task**: in `scripts/smoke-notifications.mjs`, after a notice for session A appears, stop A (`sessions:stop` or the UI), then click the notice. Assert A's row is selected and no error is thrown. If that can't be automated, add a NOTF-23 line to the hand-verify header.
- **Priority**: Major

### Fix 2 (Minor): NOTF-05's direction half can't fail

- **Fix task**: before clicking the notice at SMOKE:490, switch `ui.direction` to `tree` (via `config:patch` + UI, or the TopBar). Then assert `config:get().ui.direction === 'agents'` and the selected row after the click. Also list "the OS notification click switches to agents" explicitly in the hand-verify header.
- **Priority**: Minor

### Fix 3 (Minor): NOTF-06 has no verification step

- **Fix task**: add NOTF-06 to the hand-verify header (e.g. "run with notifications disabled at the OS / unsupported: no crash, no toast"). Or extract `showOs` behind an injected `isSupported` and unit-test the skip.
- **Priority**: Minor

### Fix 4 (Minor): NOTF-21 has no verification step

- **Fix task**: add NOTF-21 to the hand-verify header (leave an OS notification up, close the window on a platform where the app keeps running, click it: nothing happens, no error in the main log). Or unit-test `revealWindow` extracted with an injected window getter.
- **Priority**: Minor

### Fix 5 (Minor): NOTF-29's agent-form half isn't exercised

- **Fix task**: in the smoke, open the agent form (Add agent), type a name, switch tabs and back, then assert the form is still open with the typed name.
- **Priority**: Minor

### Owner action: run the smoke

`scripts/smoke-notifications.mjs` has never run. NOTF-02 (end to end), 05, 14 (end to end), 16, 18,
19 (write side), 20, 27 (end to end), 28 and 29 stay "planned evidence" until it does.

---

### R1 · Requirement Traceability Update

Proposed; `spec.md` was left unmodified by the Verifier.

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| NOTF-01..04, 07..15, 17, 22, 24..27 | Implementing | ✅ Verified |
| NOTF-16, 18, 19, 20, 28 | Implementing | ✅ Verified (logic) · smoke pending owner run |
| NOTF-05, NOTF-29 | Implementing | ⚠️ Needs Fix (partial evidence) |
| NOTF-06, NOTF-21, NOTF-23 | Implementing | ❌ Needs Fix (no evidence) |

---

### R1 · Summary

**Overall**: ❌ Not Ready. Behaviour is sound; the verification plan has holes.

**Spec-anchored check**: 24/29 ACs evidenced; 3 zero-evidence, 2 partial; 3 spec-precision gaps flagged
**Sensor**: 20/20 non-equivalent mutants killed (M7 equivalent, proven by M7d)
**Gate**: typecheck 0, lint 0 (0 errors), tests 0 (990 passed)

**What works**: the notification decision (every rule, every state, both surfaces, both switch
levels), content wording, transition reporting from `SessionManager` (attached, before/after,
unchanged views, PTY stop, throwing listener), OS-click routing, and the notice list logic.

**Issues found**: NOTF-23, NOTF-06 and NOTF-21 have no assertion and no hand-verify step. The
NOTF-05 direction check can't fail. NOTF-29's agent-form half is unexercised. The owner smoke is unrun.

**Next steps**: apply Fixes 1-5 (smoke script and its header only), have the owner run the smoke,
then re-dispatch the Verifier (round 2 of 3).

---

## Owner smoke run — 2026-09-16, 34/34 PASS

`node scripts/smoke-notifications.mjs` against the dev app, run by the owner. Three earlier
runs stopped early on **smoke defects, not feature defects**, each fixed before the passing run:

| Run | Stopped at | Cause | Fix |
| --- | ---------- | ----- | --- |
| 1 | version check | Rows were matched by `.rail-row-label`, but rail v2 labels a row with the agent name; the session title only leads the tooltip | `d641837`: select by tooltip; stop with the rows seen when a session is missing |
| 2 | version check | With the window covered the page is `hidden`, `requestAnimationFrame` stops and xterm renders nothing, so the DOM never showed the version the PTY had printed (confirmed by capturing `session:data`) | `57d88fc`: read output from `session:data` |
| 3 | — | 34/34 PASS | — |

The passing run observed, beyond the settings checks: the first event staying silent
(NOTF-27); the in-app approval notice naming the tool (NOTF-02, NOTF-04) and its click
selecting the session (NOTF-05); a switched-off state staying silent and notifying once back on
(NOTF-14); self-dismissal; **a real Windows notification while unfocused, no in-app notice at
the same time, and its click bringing the window forward with the session selected (NOTF-01,
NOTF-05)**; and a notice for a stopped session clicked from the Tree direction opening it in
Agents (NOTF-05, NOTF-23).

Found after the run: `config:patch` cannot delete a key, so the smoke's cleanup restores an
absent switch as `true` (same behaviour, absent means on). The comment and the cleanup check
now say so and compare effective values.

**Still hand-verify only:** clicking an OS notification left on screen a minute or more, a
minimized window, no notification while focused on the attached session (NOTF-03 is unit-tested
at `activity-notification.test.ts:33`), and the two-theme visual pass.

---

## Round 3 verdict (rev4 increment, NOTF-30..36): FAIL ❌ (superseded by round 4)

**Date**: 2026-09-16
**Spec**: `.specs/features/session-idle-notifications/spec.md` rev4 (P4, NOTF-30..36; assumption rows at `spec.md:75-77`; Out of Scope `spec.md:52-53`)
**Design**: `design.md` "Increment rev4" (`design.md:240-293`)
**Tasks**: T14–T20 in `tasks.md`
**Diff range**: `0f6212b..d1d5f94` (plan `0f6212b`; code `ec0d66b`..`d1d5f94`, 7 commits)
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree; mutations in a detached scratch worktree at `d1d5f94`
**Round 3 outcome**: FAIL — the behaviour is correct and discriminatingly tested (17/17 mutants killed, all gates exit 0), but two evidence/spec
items are open: the title half of NOTF-36 has no check that can fail and no named hand-verify line, and the confirmed
spec row that names the branch command (`spec.md:75`) disagrees with the shipped command without a recorded deviation — and
the smoke's expectations depend on the difference. Both are documentation/smoke-header fixes; no production code change.

### R3 · Task completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T14 `linkTask` | ✅ Done | `src/main/activity-notification.ts:108-114`, 6 tests |
| T15 `describeNotification` + `clip` | ✅ Done | `src/main/activity-notification.ts:69-95`, 6 tests |
| T16 `ActivityChange.cwd` | ✅ Done | `src/main/session-manager.ts:348,357`; `session-manager.test.ts:669` |
| T17 async notifier + `linkedTask` | ✅ Done | `src/main/session-notifier.ts:41-43`, +4 tests. Its recorded SPEC_DEVIATION placeholder (`linkedTask: async () => null`) is **gone** at `d1d5f94`: `src/main/index.ts:317` wires the real lookup |
| T18 `readBranch` + wiring | ✅ Done | `src/main/index.ts:79-91,317` (build-gated, code reading) |
| T19 notice CSS | ✅ Done | `SessionNotices.css:53,64` |
| T20 smoke | ⚠️ Written, **not yet run** for rev4 | owner-pending by convention (the rev3 run recorded above predates it) |

### R3 · Spec-anchored acceptance criteria

AN = `src/main/activity-notification.test.ts`, SN = `src/main/session-notifier.test.ts`, SMOKE = `scripts/smoke-notifications.mjs`.

| ID | Criterion (short) | Spec-defined outcome | `file:line` + assertion | Result |
| -- | ----------------- | -------------------- | ----------------------- | ------ |
| NOTF-30 | branch number + pinned task with cached details → title `#<id> · <task title>` | exact `#12345 · Fix login redirect` | `src/main/activity-notification.test.ts:164` `linkTask('user/dev/4821-login/12345-fix-login', [pin]) toEqual({ id: 12345, title: 'Fix login redirect' })` (last segment wins over the story number); `:205` `describeNotification(…) toEqual({ title: '#12345 · Fix login redirect', … })`; `src/main/session-notifier.test.ts:161` OS payload, `:160` lookup used the change's cwd; `:196` first pin wins. Wiring `src/main/index.ts:317` (code reading) | ✅ PASS |
| NOTF-31 | number not pinned / no cached details → title `#<id>` | exact `#12345` | `src/main/activity-notification.test.ts:173` uncached pin → `title: null`; `:180` unpinned → `title: null`; `:214` `title: '#12345'`; `src/main/session-notifier.test.ts:173` in-app payload `title: '#12345'`; SMOKE:596 in-app notice text `NOTICE_A(...)` = `#<id>` + state + session line (owner-pending) | ✅ PASS |
| NOTF-32 | with a task, body = state line + `<agent> · <session title>` | `Needs approval to run Bash\nClaude · feature-login` | `src/main/activity-notification.test.ts:205` exact body; `:241` agent prefix added to a renamed session; `src/main/session-notifier.test.ts:161,173` both surfaces | ✅ PASS |
| NOTF-33 | title ≤ 60 chars, cut with trailing `…` | length 60, first 59 + `…`; exactly 60 kept whole | `src/main/activity-notification.test.ts:223` `toHaveLength(60)`, `:224` `slice(0, 59) + '…'`; `:230` exactly-60 kept; `:236` no-task title cut too | ✅ PASS |
| NOTF-34 | branch unreadable (not git, detached HEAD, git failing, > 2 s) → no-task layout | rev3 layout | Decision half: `src/main/activity-notification.test.ts:191` `linkTask(null, …) toBeNull()`; `src/main/session-notifier.test.ts:196` rejected lookup → `{ title: 'Claude · feature-login', body: 'Needs approval to run Bash' }`. Shell half, code reading: `src/main/index.ts:81` `symbolic-ref --short HEAD` (fails on detached HEAD and outside git), `:83` `timeout: 2000`, `:89` any error → `null`, `:87` empty → `null`. Not named in the smoke header's code-reading list (see gap 3) | ✅ PASS (unit + code reading) |
| NOTF-35 | no Azure DevOps call to build a notification | only cached data | Code reading: `src/main/index.ts:317` uses `taskBoard.list().tasks`; `src/main/task-board.ts:127-136` `list()` maps `config.pinnedTasks` over the in-memory `details` map and touches no gateway; `readBranch` is local git only (`index.ts:79-91`) | ✅ PASS (code reading, thin shell per `.specs/codebase/TESTING.md:43`) |
| NOTF-36 | in-app notice: title up to two lines, each body line on its own line | two-line title clamp; two rendered body lines | Body half: SMOKE:603 `bodyLines === 2` over `.session-notice-body` `innerText` — can fail (without `white-space: pre-line`, `SessionNotices.css:64`, `innerText` collapses the `\n` to one line). **Title half: CSS only** (`SessionNotices.css:49-53` `-webkit-line-clamp: 2`); the smoke's task is unpinned so its title is the short `#<id>` and never wraps, and the hand-verify header does not name a long-title visual check | ⚠️ Partial (gap 1) |

**Status**: 6/7 fully evidenced (3 of them partly by owner-pending smoke / code reading as the project convention allows); 1 partial.

### R3 · Spec-precision / consistency findings

- **Gap 2 — confirmed spec row vs shipped mechanism.** `spec.md:75` (`Confirmed? y`) says the branch is read with
  `git rev-parse --abbrev-ref HEAD`; design (`design.md:273-275,291`) and code (`src/main/index.ts:81`) use
  `git symbolic-ref --short HEAD`, with no `SPEC_DEVIATION` marker and no spec edit. The two differ observably: on an
  **unborn branch** `rev-parse --abbrev-ref HEAD` fails (→ no task) while `symbolic-ref` answers (→ `#<id>`), and the rev4
  smoke builds exactly that case (`git init -b feature/<id>-notify-smoke` with no commit, SMOKE:150-153), so SMOKE:596
  only holds under the shipped command (probed: on an unborn `feature/12345-notify-smoke`, `rev-parse --abbrev-ref HEAD`
  exits 128, `symbolic-ref --short HEAD` prints the branch and exits 0). On a detached HEAD both end in the no-task layout (`HEAD` carries no number), so
  NOTF-34 is met either way. The code's choice is the better one; the spec row is stale.
- Cosmetic: `spec.md:256` still reads "NOTF-30..36 pending Tasks" although T14–T20 map them.

### R3 · Smoke script static checks

- `node --check scripts/smoke-notifications.mjs` → exit 0.
- Every in-page expression passed to `evaluate`/`waitFor` (50 of them) was extracted with acorn, its `${…}` interpolations
  stubbed, and compiled with `new Function` → **0 failures** (this catches a literal newline inside a quoted in-page string,
  the earlier bug class). The new line-count expression avoids a literal newline with `String.fromCharCode(10)` (SMOKE:601).
- Can-fail check of the changed assertions:
  - SMOKE:596 / :643 — before rev4 the title was `Claude (notifications smoke) · <A>` with a one-line body; the expectation is
    `#<id>` + state + `\n` + session line, so a missing task, a missing `#`, or a missing second line fails it.
  - SMOKE:603 — without `pre-line` the rendered body is one line → fails.
  - `TASK_ID` is chosen to avoid every existing pin (SMOKE:146-149), so the expected `#<id>` with no title is deterministic;
    `taskIdFromBranch('feature/<id>-notify-smoke')` yields `<id>` (`src/shared/tasks.ts:53-59`).
  - The owner y/n check for the Windows toast (SMOKE:690-702) only runs on a TTY; when skipped, the toast wording falls
    back to the header's hand-verify line ("the OS notification's wording as Windows shows it").
- Cleanup removes the temp repository with retries (SMOKE:185-193).

### R3 · Discrimination sensor

Scratch: `git worktree add --detach <scratchpad>/verify-wt3 d1d5f94`, `node_modules` by junction; unmutated baseline of the
three files 116/116, exit 0. Each mutant applied by exact anchor, run with `npx vitest run <files>`, restored in `finally`.

| # | File:line | Mutation | Tests | Killed? |
| - | --------- | -------- | ----- | ------- |
| R1 | `src/main/activity-notification.ts:113` | `linkTask` ignores the cached title | AN+SN | ✅ (2 failed) |
| R2 | `src/main/activity-notification.ts:112` | `linkTask` takes the last pin with the id | AN+SN | ✅ (1) |
| R3 | `src/main/activity-notification.ts:111` | no `null` when the branch has no number | AN+SN | ✅ (1) |
| R4 | `src/main/activity-notification.ts:109` | a null branch still links a task | AN+SN | ✅ (1) |
| R5 | `src/main/activity-notification.ts:72` | `clip` cuts at exactly 60 (`>=`) | AN+SN | ✅ (1) |
| R6 | `src/main/activity-notification.ts:72` | `clip` keeps 60 + `…` = 61 | AN+SN | ✅ (2) |
| R7 | `src/main/activity-notification.ts:90` | task title without `#` | AN+SN | ✅ (6) |
| R8 | `src/main/activity-notification.ts:93` | body without the session line | AN+SN | ✅ (5) |
| R9 | `src/main/activity-notification.ts:93` | second line without the agent-prefix rule | AN+SN | ✅ (1) |
| R10 | `src/main/activity-notification.ts:90` | untitled task rendered `#id · null` | AN+SN | ✅ (2) |
| R11 | `src/main/activity-notification.ts:88` | no-task title not clipped | AN+SN | ✅ (1) |
| R12 | `src/main/activity-notification.ts:92` | task title not clipped | AN+SN | ✅ (1) |
| R13 | `src/main/session-notifier.ts:33` | `linkedTask` called before / regardless of the decision | SN | ✅ (2) |
| R14 | `src/main/session-notifier.ts:42` | lookup rejection not caught | SN | ✅ (1) |
| R15 | `src/main/session-notifier.ts:42` | lookup with the session id instead of its cwd | SN | ✅ (1) |
| R16 | `src/main/session-notifier.ts:43` | linked task dropped from `describeNotification` | SN | ✅ (2) |
| R17 | `src/main/session-manager.ts:356` | `cwd` not passed in `ActivityChange` | SM | ✅ (1) |

**Sensor depth**: expanded (17 behaviour-level mutants over every new branch)
**Sensor result**: 17/17 killed

### R3 · Gate check (real tree at `d1d5f94`, judged by exit code)

| Gate | Command | Exit | Detail |
| ---- | ------- | ---- | ------ |
| Typecheck | `npm run typecheck` | **0** | — |
| Lint | `npm run lint` | **0** | 0 errors, 18 pre-existing warnings |
| Tests | `npm test` | **0** | **1006 passed / 56 files**, 0 failed, 0 skipped |

Delta from round 2: 990 → 1006 (+16 = AN 12 + SN 4; the SM change edits an existing assertion). No deletions; the 7 existing
SessionNotifier tests keep their assertions and only `await` the now-async `handle`.

### R3 · Code quality

| Principle | Status |
| --------- | ------ |
| Minimum code / surgical | ✅ `linkTask` + `clip` pure; notifier +3 lines; manager +2; `readBranch` one call |
| Matches patterns | ✅ reuses `taskIdFromBranch` (rail rule) and `TaskBoard.list()`; DI fake for `linkedTask` |
| No scope creep | ✅ no network, no new settings; Out of Scope rows (`spec.md:52-53`) respected — no ADO fetch, no tree scan |
| Every test maps to a requirement | ✅ unlabelled `linkTask` "no number" / "first pin" tests map to design `design.md:261-264` |
| Documented guidelines | ✅ `.specs/codebase/TESTING.md` (thin shell + renderer by smoke/code reading) |
| Observation | `SessionManager` calls `void sessionNotifier.handle(change)` (`src/main/index.ts:357`): a throw *after* the lookup (e.g. in `showOs`) becomes an unhandled rejection instead of reaching `#setActivity`'s try/catch. Design accepts fire-and-forget (`design.md:271-272`); not a gap, noted for awareness |

### R3 · Fix plans

1. **(Minor) NOTF-36 title half** — add a hand-verify line to the smoke header ("an in-app notice with a long task title wraps
   to at most two lines, ending in an ellipsis"), or give the smoke a pinned-looking long title path. Preferably both: the
   header line is enough under the convention.
2. **(Minor) Spec row drift** — update `spec.md:75` to `git symbolic-ref --short HEAD` (and why: an unborn branch still
   answers, a detached HEAD fails), or record a `SPEC_DEVIATION` in `index.ts` at `readBranch`. Also refresh `spec.md:256`.
3. **(Minor) NOTF-34 shell half** — name NOTF-34 in the smoke header's "CODE READING ONLY" list with its guards
   (`symbolic-ref` fails on detached HEAD / outside git, `timeout: 2000`, any error → `null`), as was done for NOTF-06/21.
4. **(Owner)** run `node scripts/smoke-notifications.mjs` for rev4, including the TTY y/n check of the Windows toast's
   three lines (the design's newline risk, `design.md:283`).

### R3 · Requirement traceability (proposed; `spec.md` not modified by the Verifier)

| Requirement | New status |
| ----------- | ---------- |
| NOTF-30..33, NOTF-35 | ✅ Verified (unit / code reading), smoke owner-pending |
| NOTF-34 | ✅ Verified (unit + code reading) · header line pending (fix 3) |
| NOTF-36 | ⚠️ Needs Fix (title half, fix 1) |

### R3 · Summary

**Overall**: ❌ Not Ready — behaviour sound; three cheap evidence/documentation fixes.
**Spec-anchored check**: 6/7 ACs fully evidenced, 1 partial; 1 spec-row drift, 1 cosmetic
**Sensor**: 17/17 killed
**Gate**: typecheck 0, lint 0, tests 0 (1006 passed)

---

## Validation (round 4 — rev4 increment re-verification, NOTF-30..36): PASS ✅

**Date**: 2026-09-16
**Diff range**: `0f6212b..b522d5f`; fix round 2 = `b522d5f` (on top of round 3's `d1d5f94`)
**Iteration**: 2 of a maximum 3 for the rev4 increment
**Verifier**: independent sub-agent (author ≠ verifier); read-only over the real tree; probes and mutants in a detached scratch worktree at `b522d5f`
**Result**: PASS — all three round-3 gaps are closed and re-confirmed; the only production change (`src/main/index.ts:359-363`) is
correct and leaves notification behaviour unchanged; gates exit 0 with 1006 tests; the rev4 mutants were re-run at `b522d5f`
and all 17 are still killed. The rev4 owner smoke remains owner-pending by convention.

### R4 · What changed in `b522d5f`

`git diff --stat d1d5f94 b522d5f -- src` → only `src/main/index.ts` (+7/−1). Otherwise `spec.md` (2 lines),
`tasks.md` (fix-round record) and the header comment of `scripts/smoke-notifications.mjs` (+8 lines, no executable change).

### R4 · Round-3 gap disposition

| # | Round-3 gap | Status | Proof |
| - | ----------- | ------ | ----- |
| 1 | NOTF-36 title half: CSS only, no named hand-verify | ✅ **CLOSED** (hand-verify, owner-pending) | `scripts/smoke-notifications.mjs:30-33` names the check: pin a long-titled task, run on its branch, notice must wrap to two lines ending in `…`, and says why this smoke's `#<id>` title cannot show it. Satisfies the project's hand-verify convention for renderer CSS (`.specs/codebase/TESTING.md:42,68`); the CSS it verifies is `src/renderer/src/components/SessionNotices.css:49-53` |
| 2 | Confirmed spec row named `rev-parse --abbrev-ref`; code uses `symbolic-ref --short` | ✅ **CLOSED** | `spec.md:75` now names `git symbolic-ref --short HEAD` and the reason (answers on a branch with no commits, fails on a detached HEAD) — matches `src/main/index.ts:81` and my round-3 probe (unborn branch: `rev-parse` exit 128, `symbolic-ref` exit 0). `spec.md:256` coverage line now maps NOTF-30..36 to T14–T20 + fix round 2 |
| 3 | NOTF-34 git half not named as code reading | ✅ **CLOSED** | `scripts/smoke-notifications.mjs:42-45` lists it under CODE READING ONLY; each named guard re-checked: any git error / outside git / detached HEAD → `catch` → `null` (`src/main/index.ts:81,89`), empty stdout → `null` (`:87`), `timeout: 2000` (`:83`, execFile kills and rejects → `null`); the null-branch consequence is unit-tested at `src/main/activity-notification.test.ts:191` and `src/main/session-notifier.test.ts:196` |
| 4 | Owner has not run the rev4 smoke | ⏳ **OWNER-PENDING** (by convention) | unchanged; includes the TTY y/n check of the Windows toast's three lines |

### R4 · The production change: `onActivityChange` catches the async notifier

Shipped at `src/main/index.ts:359-363`:
`onActivityChange: (change) => { sessionNotifier.handle(change).catch((err) => console.error('[notifications] session notification failed', err)) }`

**Code reading.**
- Since rev4, `SessionNotifier.handle` is `async` (`src/main/session-notifier.ts:32`), so *every* throw inside it, including
  a throw from `prefs()`/`windowFocused()` before the first `await`, becomes a rejection, not a synchronous throw.
  `SessionManager`'s `try/catch` around the listener (`src/main/session-manager.ts:352-362`) therefore never saw notifier
  failures after rev4; with `void` they were unhandled rejections. The `.catch` restores the "a notifier bug is logged and
  never breaks activity" guarantee that round 1 verified for the synchronous notifier.
- The arrow still returns `undefined` synchronously, as the `void` form did, so `SessionManager` behaviour
  (`session:activity` emit first, listener second) is unchanged.
- The success path is untouched: `.catch` only runs on rejection. No NOTF outcome (decision, surface, wording, task
  lookup, click routing) passes through the handler.
- `SessionNotifier.handle` already absorbs a failed task lookup (`session-notifier.ts:42` `.catch(() => null)`,
  NOTF-34), so the new handler only sees failures *after* the lookup (`describeNotification`, `showOs`, `emit`) or in the
  synchronous prefix. That is the intended scope: log it and drop that one notification.

**Scratch probe** (not committed; a throwaway test file in the scratch worktree that imports the real `SessionNotifier` and
reproduces the shipped wrapper verbatim):

| Probe | Result |
| ----- | ------ |
| `showOs` throws → `handle()` does not throw synchronously, it rejects | ✅ confirmed |
| `prefs()` throws (before any `await`) → also a rejection, so `SessionManager`'s try/catch cannot catch it | ✅ confirmed |
| Shipped wrapper: returns `undefined` synchronously, logs the failure, **no `unhandledRejection`** | ✅ passed |
| Shipped wrapper, success path: exactly one OS notification `Claude · repo` / `Finished its turn`, nothing logged | ✅ passed |
| **Mutant W1**: wrapper reverted to the round-3 `void notifier.handle(c)` | ✅ **killed**: the no-unhandled-rejection probe fails (1 failed / 3 passed) |

Verdict on the change: correct, necessary for the async notifier, no NOTF behaviour change. It lives in the thin Electron
wiring that `.specs/codebase/TESTING.md:43,67` exempts from unit tests, so this code reading plus the probe is the evidence;
no committed test is expected.

### R4 · Spec-anchored acceptance criteria (rev4)

Source and unit tests of the decision layer are byte-identical to round 3 (only `index.ts` changed), so round 3's
`file:line` evidence for NOTF-30..35 stands unchanged. The partial row is now complete:

| ID | Round 3 | Round 4 | Evidence |
| -- | ------- | ------- | -------- |
| NOTF-30, 31, 32, 33 | ✅ PASS | ✅ PASS | unchanged (`src/main/activity-notification.test.ts:164,173,180,205,214,223,224,230,236,241`; `src/main/session-notifier.test.ts:160,161,173`) |
| NOTF-34 | ✅ PASS (unit + code reading) | ✅ PASS, now named in the smoke header | `src/main/activity-notification.test.ts:191`; `src/main/session-notifier.test.ts:196`; `src/main/index.ts:81,83,87,89`; `scripts/smoke-notifications.mjs:42-45` |
| NOTF-35 | ✅ PASS (code reading) | ✅ PASS | `src/main/index.ts:317`; `src/main/task-board.ts:127-136` |
| NOTF-36 | ⚠️ Partial | ✅ PASS (body: smoke check; title: named hand-verify) | `scripts/smoke-notifications.mjs:611` (`bodyLines === 2`, can fail); `scripts/smoke-notifications.mjs:30-33` hand-verify; `SessionNotices.css:49-53,64` |

**Status**: ✅ 7/7 ACs evidenced at the level the project convention requires; 0 spec-precision gaps.

### R4 · Smoke static checks

- `node --check scripts/smoke-notifications.mjs` → exit 0.
- The acorn check of all 50 in-page `evaluate`/`waitFor` expressions → 0 failures (only header comments changed).

### R4 · Discrimination sensor

- Rev4 mutants R1–R17 (table in round 3) **re-run at `b522d5f`**: **17/17 killed**.
- W1 (the `.catch` reverted to `void`): killed by the scratch probe above. No committed test targets it, which is by
  convention for `index.ts` wiring.

**Sensor result**: 18/18 killed (17 committed-suite mutants + 1 scratch-probe mutant)

### R4 · Gate check (real tree at `b522d5f`, judged by exit code)

| Gate | Command | Exit | Detail |
| ---- | ------- | ---- | ------ |
| Typecheck | `npm run typecheck` | **0** | — |
| Lint | `npm run lint` | **0** | 0 errors, 18 pre-existing warnings |
| Tests | `npm test` | **0** | **1006 passed / 56 files**, 0 failed, 0 skipped (unchanged from round 3) |

### R4 · Lessons

No new grounded failure this round, so nothing new was recorded. L-019 and L-022 (round 3) stay as candidates; this fix
applied them rather than contradicting them.

### R4 · Summary

**Overall**: ✅ Ready — pending the owner's rev4 smoke run and the named hand-verify items, by convention.
**Spec-anchored check**: NOTF-30..36 all evidenced; 0 gaps
**Sensor**: 17/17 rev4 mutants still killed; W1 killed by probe
**Gate**: typecheck 0, lint 0, tests 0 (1006 passed)
