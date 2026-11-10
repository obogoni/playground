# Tray Residency Validation

**Date**: 2026-11-06
**Spec**: `.specs/features/tray-residency/spec.md`
**Diff range**: `b98213d..42c2d85` (feature commits f33d73d..068f3ff + fix round 1 42c2d85)
**Verifier**: independent sub-agent (author ≠ verifier)
**Iteration**: 2 of max 3

**Result**: PASS

Every AC now has unit/smoke evidence matching the spec outcome, or a declared owner-UAT line in `tasks.md` (for what CDP cannot reach). All 8 mutants are killed. Owner hand-UAT is still outstanding (list below) and is not part of this automated verdict.

### Iteration history

- Iteration 1 (068f3ff): verdict FAIL. M1 (`running === 0` → `running <= 1`) survived, because no test had exactly one running session (TRAY-11). TRAY-16 had no evidence and no UAT line. TRAY-11 dialog buttons/default were untested. TRAY-03 hooks/notifications while hidden were unasserted.
- Fix round 1 (42c2d85): adds an N=1 test, moves the dialog options into `quitDialog()` + `QUIT_RESPONSE` with a unit test, and adds TRAY-16 and TRAY-03 hooks/notifications to the T4 owner-UAT line.
- Iteration 2 (this report): every iteration-1 gap is closed or declared as owner UAT.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1 Shared login-item types | ✅ Done | `src/shared/login-item.ts` |
| T2 LoginItemService | ✅ Done | 14 unit tests |
| T3 ResidencyController | ✅ Done | 17 unit tests (incl. fix round 1) |
| T4 Wiring + smoke | ✅ Automated items done | Owner UAT pending for TRAY-01/03 (hooks, notifications)/04/06/12/16 (declared, `tasks.md` T4) |
| T5 Login item IPC | ✅ Done | Smoke TRAY-25 checks |
| T6 Checkbox view | ✅ Done | 6 unit tests |
| T7 Settings checkbox | ✅ Automated items done | Owner UAT pending for TRAY-21/22/23 on the installed app (declared) |

---

## Spec-Anchored Acceptance Criteria

Legend: ✅ covered, assertion matches the spec outcome · 🟡 policy/partial covered, remainder declared owner UAT

| AC | Spec-defined outcome | Evidence (`file:line` - assertion) | Result |
| -- | -------------------- | ---------------------------------- | ------ |
| TRAY-01 tray icon + tooltip | App icon, tooltip `Playground` | Code: `src/main/index.ts:974-975` (`tray.setToolTip('Playground')`). CDP cannot reach the tray → owner UAT (`tasks.md` T4) | 🟡 UAT |
| TRAY-02 X hides, no session stops | prevent close + hide; process alive | `src/main/residency-controller.test.ts:55-56` - `expect(e.prevented).toBe(true)`, `expect(h.calls).toEqual(['hide'])`; `scripts/smoke-tray-residency.mjs:297-298` - `app.exitCode` null, `waitShown(false)` false | ✅ |
| TRAY-03 PTY, hooks, notifications keep working while hidden | session running, output flowing; hooks + notifications | `scripts/smoke-tray-residency.mjs:303` status `'running'`, `:305` ticks grew after hide. Hooks/notifications while hidden → owner UAT (`tasks.md` T4, added in fix round 1) | 🟡 PTY ✅ + UAT |
| TRAY-04 tray click reveals | show, restore, focus | `src/main/residency-controller.test.ts:168` - `toEqual(['reveal'])`; wiring `src/main/index.ts:976`; reveal body `src/main/index.ts:241` | 🟡 policy ✅ + UAT |
| TRAY-05 menu `Open Playground`, `Quit` | exact labels, clicks reveal / request quit | `src/main/residency-controller.test.ts:174` - `toEqual(['Open Playground', 'Quit'])`; `:180` reveal; `:186` confirm `[2]` | ✅ |
| TRAY-06 notification click while hidden reveals session | show + focus that session | Pre-existing path `src/main/index.ts:687` → `revealWindow` (`:241`); owner UAT (`tasks.md` T4) | 🟡 UAT |
| TRAY-10 Quit, 0 running | quit, no dialog | `src/main/residency-controller.test.ts:73-74` - `confirms toEqual([])`, `calls toEqual(['quit'])` | ✅ |
| TRAY-11 Quit, N ≥ 1 | dialog `N running session(s) will be stopped. Quit anyway?`, `Quit`/`Cancel`, `Cancel` default | `src/main/residency-controller.test.ts:80` confirms `[2]`; `:87` confirms `[1]` (N=1 boundary); `:92` exact message; `:97-106` full options object `buttons: ['Quit','Cancel'], defaultId: 1, cancelId: 1` and `buttons[QUIT_RESPONSE] === 'Quit'`; wiring `src/main/index.ts:257-258` | ✅ |
| TRAY-12 confirm → stop sessions, existing shutdown path | quit via will-quit guard | `src/main/residency-controller.test.ts:114` - `calls toEqual(['quit'])`; `:64` close allowed after before-quit; guard unchanged `src/main/index.ts:349`. End-to-end no-orphan → owner UAT | 🟡 policy ✅ + UAT |
| TRAY-13 Cancel → keep running | no quit; X still hides | `src/main/residency-controller.test.ts:125` - `e.prevented` true after cancel (with `calls toEqual([])`) | ✅ |
| TRAY-14 update applied on quit | `autoInstallOnAppQuit` as today | Pre-existing `src/main/update-service.test.ts:79` - `expect(updater.autoInstallOnAppQuit).toBe(true)`; untouched by diff | ✅ |
| TRAY-15 logoff quits without dialog | quit, no confirm, window closes | `src/main/residency-controller.test.ts:152-153`, `:161`; wiring `src/main/index.ts:294`. Real logoff → owner UAT (`tasks.md` line after Phase Execution Map) | 🟡 policy ✅ + UAT |
| TRAY-16 tray removed on quit | tray destroyed | Code: `src/main/index.ts:978` (`onWillQuit(() => tray?.destroy())`); owner UAT (`tasks.md` T4, added in fix round 1) | 🟡 UAT |
| TRAY-20 label + note | `Start Playground when Windows starts` / `opens hidden in the tray` | `src/renderer/src/lib/login-item-view.test.ts:6`, `:10-15`; smoke `scripts/smoke-tray-residency.mjs:351-356` | ✅ |
| TRAY-21 reflects OS state | `executableWillLaunchAtLogin ?? openAtLogin` | `src/main/login-item.test.ts:67-86`; `src/renderer/src/lib/login-item-view.test.ts:19`; load on open `src/renderer/src/components/SettingsDialog.tsx:106`; installed app → owner UAT (T7) | 🟡 policy ✅ + UAT |
| TRAY-22 toggle writes exe + `--hidden` at once | `{openAtLogin, path: execPath, args: ['--hidden']}` | `src/main/login-item.test.ts:45`, `:99`, `:106`; onChange `src/renderer/src/components/SettingsDialog.tsx:492`; installed app → owner UAT (T7) | 🟡 policy ✅ + UAT |
| TRAY-23 `--hidden` start hidden | window not shown | `scripts/smoke-tray-residency.mjs:368` - `windowShown()` false; gate `src/main/index.ts:288`; login start on installed app → owner UAT (T7) | ✅ (dev) + UAT |
| TRAY-24 normal start shows window | window shown | `scripts/smoke-tray-residency.mjs:276` | ✅ |
| TRAY-25 unpackaged: disabled, note, no write | exact objects, zero writes | `src/main/login-item.test.ts:51`, `:57-62` (`writes toEqual([])`); `src/renderer/src/lib/login-item-view.test.ts:23-28`; smoke `scripts/smoke-tray-residency.mjs:319-328`, `:351-356`, `:386` (HKCU Run key unchanged) | ✅ |
| TRAY-26 failure → read-back + message | `ok:false`, read-back state, `Couldn't change the startup setting: <line>` | `src/main/login-item.test.ts:115-119`, `:125-129`; `src/renderer/src/lib/login-item-view.test.ts:31-33`; apply `src/renderer/src/components/SettingsDialog.tsx:141-145` | ✅ |
| TRAY-30 single-instance lock | loser exits before window/host/hook server | `scripts/smoke-tray-residency.mjs:310` exit ≤ 10 s; ordering by inspection `src/main/index.ts:266-267`, `:366` | ✅ |
| TRAY-31 second launch reveals, even `--hidden` | first window visible | `src/main/residency-controller.test.ts:168`; smoke `scripts/smoke-tray-residency.mjs:311-315` (launch carries `--hidden`, `:87`) | ✅ |
| TRAY-32 lock acquired → TRAY-23/24 | as TRAY-23/24 | smoke `:276`, `:368` | ✅ |

**Status**: All 23 ACs have evidence or a declared owner-UAT line. No AC is without both.

### Spec-precision notes (non-blocking)

- TRAY-03 bundles PTY, activity hooks and notifications under "keep working". Only the PTY part is observable to automation; the rest is now an explicit UAT line.
- TRAY-30 "before any window, PTY host or hook server" is not observable by the smoke (it measures exit only); verified by reading `src/main/index.ts:266-267,366`.

### Edge cases

- [x] Quit dialog from a hidden window is parentless (`src/main/index.ts:256-257`), so it shows without revealing the window. Code-inspected; UAT with TRAY-12.
- [x] Non-`Quit` quit paths keep the PTY-host will-quit guard: `src/main/residency-controller.test.ts:64`, guard `src/main/index.ts:349`.
- [x] An attached terminal keeps receiving data while hidden: `scripts/smoke-tray-residency.mjs:305`.

---

## Discrimination Sensor

Isolation: in-place mutation from scratchpad byte backups, one mutant at a time, restored with `Copy-Item`, `git diff --exit-code <file>` = 0 after each. No stash, no worktree. `git status --porcelain` before/after iteration 2: `?? .specs/features/ado-triggers/` + `?? .specs/features/tray-residency/validation.md` (identical).

| # | Iter | File:line | Mutation | Test outcome | Killed? |
| - | ---- | --------- | -------- | ------------ | ------- |
| M1 | 1 | `src/main/residency-controller.ts:50` (068f3ff) | `running === 0` → `running <= 1` | 15/15 pass | ❌ Survived (iter 1) |
| M1 | 2 | `src/main/residency-controller.ts:72` (42c2d85) | same | 1 failed: "asks even when exactly one session runs (TRAY-11)" | ✅ Killed |
| M2 | 1 | `src/main/residency-controller.ts:63` (068f3ff) | removed `#quitting = true` in `onSessionEnd` | 1 failed (TRAY-15 close afterwards) | ✅ Killed |
| M3 | 1 | `src/main/residency-controller.ts:48` (068f3ff) | removed pending-dialog dedupe | 1 failed (one dialog when asked twice) | ✅ Killed |
| M4 | 1 | `src/main/login-item.ts:34` | `executableWillLaunchAtLogin ?? openAtLogin` → `openAtLogin` | 2 failed (TRAY-21 combos) | ✅ Killed |
| M5 | 1 | `src/main/login-item.ts:55` | read-back comparison forced false | 1 failed (TRAY-26 sticky write) | ✅ Killed |
| M6 | 1 | `src/renderer/src/lib/login-item-view.ts:20` | `disabled: !state.available` → `false` | 1 failed (TRAY-25) | ✅ Killed |
| M7 | 2 | `src/main/residency-controller.ts:44` | `quitDialog` `defaultId: 1` → `0` (Quit becomes default) | 1 failed: "offers Quit and Cancel, Cancel the default (TRAY-11)" | ✅ Killed |
| M8 | 2 | `src/main/residency-controller.ts:50` | `QUIT_RESPONSE = 0` → `1` (Cancel would quit) | 1 failed: same test (`buttons[QUIT_RESPONSE]`) | ✅ Killed |

**Sensor depth**: lightweight (8 distinct mutants across both iterations)
**Sensor verdict**: 8/8 killed in current code, PASS

Note on `SMOKE_BREAK=1`: it swaps every expected value for a wrong one. That proves each smoke check is not vacuous, not that the smoke detects a behavior regression. Not re-run by the Verifier.

---

## Interactive UAT (owner, pending; not performed by the Verifier)

| # | Item | Declared in |
| - | ---- | ----------- |
| 1 | TRAY-01 tray icon + tooltip `Playground` visible | `tasks.md` T4 |
| 2 | TRAY-04 tray click reveals | `tasks.md` T4 |
| 3 | TRAY-06 notification click while hidden reveals the session | `tasks.md` T4 |
| 4 | TRAY-03 while hidden: finished turn raises the native notification, rail activity updates on reveal | `tasks.md` T4 (fix round 1) |
| 5 | TRAY-12 tray Quit with sessions → count dialog → app ends, no orphan pwsh/agent | `tasks.md` T4 |
| 6 | TRAY-16 tray icon gone after Quit | `tasks.md` T4 (fix round 1) |
| 7 | TRAY-21/22/23 installed app: toggle on → Startup apps; logoff/login → tray, no window; toggle off → gone | `tasks.md` T7 |
| 8 | TRAY-15 real logoff ends the app without dialog, no orphan | `tasks.md` (note after Phase Execution Map) |

Judgement: the split is honest. Each pending item depends on a surface CDP cannot drive (tray, toast, installed login item, OS logoff), and each has its decision logic unit-tested where any logic exists.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ |
| Surgical changes | ✅ (fix round touches only the dialog options and tests) |
| No scope creep | ✅ |
| Matches patterns (injected ports, `*-view.ts`, CDP smoke with async `rm`) | ✅ |
| Spec-anchored outcome check | ✅ |
| Per-layer coverage (policy modules: all branches incl. N=1 boundary) | ✅ |
| Every test maps to a spec requirement | ✅ |
| Documented guidelines followed: `vitest.config.ts`, STATE AD-003/AD-005 (no `vi.mock`, injected fakes) | ✅ |

---

## Gate Check

- **Quick (re-run, iteration 2)**: `npx vitest run src/main/login-item.test.ts src/main/residency-controller.test.ts src/renderer/src/lib/login-item-view.test.ts src/main/update-service.test.ts` → 44 passed, 0 failed
- **Typecheck (re-run, iteration 2)**: exit 0
- **Lint**: `npm run lint` exit 0, 0 errors / 17 warnings (iteration 1); `npx eslint` on changed files of 42c2d85 → clean (iteration 2)
- **Full `npm test` (author, not re-run)**: 12 failed / 3123 passed at 068f3ff. The author attributes these to the git/longpaths baseline, identical on `origin/main` b8402ba, plus 4 isolated-pass load timeouts. The diff touches none of those modules.
- **Smoke (author, not re-run)**: 13/13; `SMOKE_BREAK=1` fails all 11 TRAY checks. Fix round 1 changes no smoke-observable behavior (dialog options moved verbatim).
- **Test delta**: +37 unit tests (14 + 17 + 6) and a 13-check smoke; no tests removed.

---

## Requirement Traceability Update

| Requirement | New Status |
| ----------- | ---------- |
| TRAY-02, 05, 10, 11, 13, 14, 20, 24, 25, 26, 30, 31, 32 | ✅ Verified |
| TRAY-23 | ✅ Verified (dev); installed login start owner UAT |
| TRAY-03, 04, 12, 15, 21, 22 | 🟡 Policy verified; owner UAT pending |
| TRAY-01, 06, 16 | 🟡 Owner UAT pending (code-inspected) |

---

## Summary

**Overall**: ✅ Ready for owner UAT

**Spec-anchored check**: 23/23 ACs have evidence or a declared owner-UAT line; 2 non-blocking spec-precision notes (TRAY-03, TRAY-30)
**Sensor**: 8/8 mutants killed on 42c2d85 (M1 survived in iteration 1, now killed)
**Gate**: 44 unit passed / 0 failed; typecheck 0; lint 0 errors

**Next steps**: owner runs the 8 UAT items above on the installed nightly; then mark the 🟡 rows verified.
