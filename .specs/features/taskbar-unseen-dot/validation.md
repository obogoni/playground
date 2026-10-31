# Taskbar Unseen Dot Validation

**Date**: 2026-10-31
**Spec**: `.specs/features/taskbar-unseen-dot/spec.md` (issue #184)
**Diff range**: `main..HEAD` on `feature/taskbar-unseen-dot` (`7d7a7731`, `05e5005e`, `a7884100`)
**Verifier**: independent sub-agent (author ≠ verifier)

## Validation: taskbar-unseen-dot — PASS

Every acceptance criterion and edge case is backed by a unit assertion, a smoke check, or both, except
TBDT-05. TBDT-05 is two guards in `index.ts` that no automated layer can reach. All 4 unit mutants were
killed. The 3 smoke mutants the author ran show the wiring checks can fail. The gate is green. The
remaining items are smoke-evidence follow-ups, not production defects.

---

## Task Completion

There is no `tasks.md` for this feature. The plan was approved inline, and its steps landed as the three
commits above.

| Step | Commit | Status |
| ---- | ------ | ------ |
| Dot state (`UnseenBadge`) + tests | `7d7a7731` | ✅ Done |
| `SessionNotifier.flagUnseen` + tests, `index.ts` wiring, `resources/unseen-dot.png` | `05e5005e` | ✅ Done |
| Smoke `scripts/smoke-taskbar-dot.mjs` | `a7884100` | ✅ Done |

The plan put the dot state inside the `index.ts` wiring. The author moved it into the pure module
`src/main/unseen-badge.ts`. This follows the injected-fake pattern in `.specs/codebase/TESTING.md`
(pattern 3) and adds no behaviour beyond the spec. It is accepted.

---

## Spec-Anchored Acceptance Criteria

| Criterion | Spec-defined outcome | Evidence (`file:line` + assertion) | Result |
| --------- | -------------------- | ---------------------------------- | ------ |
| AC1 / TBDT-01: an OS toast sets the dot | Overlay set on the window's taskbar icon, with the description `Unseen notifications` | `src/main/session-notifier.test.ts:230-231` - `expect(shown).toHaveLength(1)`; `expect(flags.count).toBe(1)`. `src/main/unseen-badge.test.ts:17` - `expect(calls).toEqual(['show'])`. Wiring: `src/main/session-notifier.ts:57` (flag after `showOs`), `src/main/index.ts:695` (`flagUnseen: () => badge.flag()`), `src/main/index.ts:679` (`setOverlayIcon(nativeImage.createFromPath(unseenDot), 'Unseen notifications')`). Smoke check 1 (`scripts/smoke-taskbar-dot.mjs:210-214`) - `seen.length === 1 && seen[0].dot && seen[0].description === 'Unseen notifications'` | ✅ PASS |
| AC2 / TBDT-02: an in-app notice or no notification leaves the overlay alone | No flag | `src/main/session-notifier.test.ts:244-245` - `expect(emitted.map((e) => e.channel)).toEqual(['session:notice'])`; `expect(flags.count).toBe(0)`. `src/main/session-notifier.test.ts:251` - `expect(flags.count).toBe(0)` (a `working` transition, nothing notifies). `flagUnseen` is only ever called from `session-notifier.ts:57`, after the in-app `return` at :51 | ✅ PASS |
| AC3 / TBDT-03: window focus clears the overlay | Overlay cleared (`setOverlayIcon(null, '')`) | `src/main/unseen-badge.test.ts:32` - `expect(calls).toEqual(['show', 'clear'])`; `:41` - `expect(calls).toEqual(['show', 'clear'])` (no clear without a shown dot). Wiring: `src/main/index.ts:244-246` (`win.on('focus', () => unseenBadge?.clear())`), `:680`. Smoke check 3 (`scripts/smoke-taskbar-dot.mjs:222-238`) - `seen.length === 2 && seen[1].dot === false`. In the author's run the OS granted the focus | ✅ PASS |
| AC4 / TBDT-04: another toast while the dot is shown keeps one dot | One `show`; later flags change nothing | `src/main/unseen-badge.test.ts:25` - `expect(calls).toEqual(['show'])` after three flags. `src/main/session-notifier.test.ts:238` - `expect(flags.count).toBe(2)` (the notifier always asks; the badge dedups). Smoke check 2 (`scripts/smoke-taskbar-dot.mjs:217-219`) - `seen.length === 1` | ✅ PASS (see follow-up F1) |
| AC5 / TBDT-05: a destroyed window or a platform without overlay support skips the dot without error | No call, no throw | Code only: `src/main/index.ts:678` - `if (process.platform !== 'win32' \|\| !mainWindow \|\| mainWindow.isDestroyed()) return`. This is the same guard shape as `revealWindow` (`index.ts:588`, NOTF-21). No unit test or smoke check covers it. `setOverlay` is an `index.ts` closure, which has no unit-test layer (TESTING.md). A non-Windows platform cannot run on the Windows-only target. On Windows, a destroyed window nulls `mainWindow` (`index.ts:268-270`) and quits the app (`window-all-closed`). | ⚠️ Evidence by inspection only (follow-up F3) |

**Status**: TBDT-01 to TBDT-04 match the outcomes the spec defines. TBDT-05 is covered by code inspection only;
the owner's loop rule makes this a follow-up, not a FAIL, because the guard is present and correct.

### Assumption rows

| Assumption | Evidence | Result |
| ---------- | -------- | ------ |
| Dot appears whenever `SessionNotifier` shows an OS toast (surface `os`) | `session-notifier.ts:53-57`; `session-notifier.test.ts:230-231` | ✅ |
| Clears on the window's `focus` event | `index.ts:244-246`; smoke check 3 | ✅ |
| Shape: one fixed bundled red-dot image set as the overlay | `resources/unseen-dot.png` (32x32 RGBA red disc, inspected); `index.ts:21,679`; `electron-builder.yml` unpacks `resources/**` (same as `icon.png`). Smoke check 1 asserts a non-empty image, not the specific image | ✅ (looks verified by hand only) |
| Description `Unseen notifications` | `index.ts:679`; smoke check 1 asserts the exact string | ✅ |
| A toast while the dot is shown is a no-op | `unseen-badge.ts:18`; `unseen-badge.test.ts:25` | ✅ |
| Platform without overlay support, or a destroyed window: skip | `index.ts:678` | ⚠️ inspection only (F3) |

---

## Edge Cases

- [x] Notifications switched off, globally or for that state, set no dot. Unit: `src/main/session-notifier.test.ts:254-260` - `expect(flags.count).toBe(0)` after `enabled: false` and after `states['needs-approval']: false`. Smoke check 4 (`scripts/smoke-taskbar-dot.mjs:240-257`) - `seen.length === 2` with `ui.notify = false`. The count is cumulative, so the check can only fail while check 3 has left the badge cleared. The author's mutant M3 (flag before the surface check) failed check 4, which shows the check can fail.
- [x] Clicking the toast clears the dot. This is evidence across two layers. The click reveals the window: `src/main/session-notifier.test.ts:106` - `expect(calls).toEqual(['reveal', 'emit:session:focus'])`, and `revealWindow` calls `restore/show/focus` (`index.ts:587-592`). Focus clears the dot: smoke check 3 drives the same `restore(); show(); focus()` sequence. No check clicks a real toast (follow-up F2).
- [x] Minimized window plus a toast sets the dot. `windowFocused` treats a minimized window as unfocused (`index.ts:595-596`). Smoke check 1 minimizes the window first.

---

## Discrimination Sensor

Unit layer: the mutants ran in a temporary detached `git worktree` in the author scratchpad, with a
`node_modules` junction. Only the two test files ran there (baseline 22 passed). Each file was restored after its mutant. The
junction link was removed before `git worktree remove --force`, followed by `git worktree prune`;
`npm ls --depth=0` reports nothing missing.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ----------- | ------- |
| U1 | `src/main/unseen-badge.ts:18` | Dropped `if (this.#shown) return`, so the dot shows on every flag | ✅ Killed (`unseen-badge.test.ts` "keeps a single dot") |
| U2 | `src/main/unseen-badge.ts:24` | Dropped `if (!this.#shown) return`, so `clear` runs without a shown dot | ✅ Killed ("does nothing on focus when no dot is shown") |
| U3 | `src/main/session-notifier.ts:49-50` | Calls `flagUnseen()` for an in-app notice | ✅ Killed (`session-notifier.test.ts` "leaves the dot alone for an in-app notice") |
| U4 | `src/main/unseen-badge.ts:25` | `clear` keeps `#shown = true` | ✅ Killed (two tests, incl. "shows the dot again ... after it was cleared") |

**Sensor depth**: lightweight (not a P0 path)
**Result**: 4/4 killed - PASS ✅

Smoke layer (the author's mutants, each run on a relaunched dev app with a throwaway profile; files restored afterwards):

| Mutant | Effect | Checks that failed |
| ------ | ------ | ------------------ |
| M1 `index.ts` never flags | No overlay at all | all 4 |
| M2 no `focus` listener | Dot never clears | check 3 (TBDT-03) |
| M3 notifier flags before checking the surface | Dot set with notifications off | check 4 (edge case 1) |

The Verifier ran no extra smoke mutants (0 of the 2 allowed). The remaining smoke weaknesses are F1 and F2.
F1 is already killed at the unit layer by U1. The TBDT-05 guard (F3) cannot be reached on the Windows dev
app: a destroyed window quits the app, and the platform guard cannot be exercised on Windows. A smoke
mutant of either guard would survive by construction and prove nothing new.

### Smoke review

- Check 1 asserts exactly one call, a non-empty image and the exact description. It can fail.
- Check 2 (`seen.length === 1`) never confirms that the second turn showed a toast. If the second turn had not notified, the check would pass anyway (F1). The unit layer covers TBDT-04 (U1 killed).
- Check 3 falls back to firing `focus` itself when the OS refuses focus, and the check name says which happened. The author's run reports focus granted by the OS. M2 shows the check can fail.
- Check 4 counts overlay calls cumulatively and depends on check 3 having cleared the dot. If check 3 had failed, the badge would still be shown, so check 4 could not fail. The two checks are not independent, but M3 shows check 4 can fail when check 3 passes.
- The script refuses to run on the owner's `userData` and uses a fake agent that only records its hook token. It restores `ui.notify` and the agent list in `finally`. The repository file has no absolute user paths.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code (28-line pure module, 3-line notifier change, ~20 lines of wiring) | ✅ |
| Surgical changes (only notifier, wiring, new module, asset, smoke) | ✅ |
| No scope creep (no count, no setting, no flash, Windows only) | ✅ |
| Matches patterns (injected port like `SessionNotifier` deps; guard copied from `revealWindow`; `?asset` import like `icon.png`) | ✅ |
| Spec-anchored outcome check (asserted values match spec) | ✅ (TBDT-05 by inspection) |
| Per-layer coverage: the pure module has 1:1 AC tests; the thin shell is covered by the smoke, per TESTING.md | ✅ |
| Every new test maps to a TBDT id or edge case (each `it` names it) | ✅ |
| Documented guidelines followed: `.specs/codebase/TESTING.md` (extract seam, unit-test it, smoke the shell) | ✅ |

---

## Gate Check

Run read-only in the real tree:

- `npm run typecheck`: exit 0 (node + web)
- `npx vitest run src/main/unseen-badge.test.ts src/main/session-notifier.test.ts`: 2 files, **22 passed**, 0 failed, 0 skipped
- `npx eslint` on `src/main/unseen-badge.ts`, `unseen-badge.test.ts`, `session-notifier.ts`, `session-notifier.test.ts`, `index.ts`, `scripts/smoke-taskbar-dot.mjs`: exit 0, no findings
- Test count (author's full suite): 3001 on `main`, 3011 on the branch (+10 = 5 `UnseenBadge` + 5 `SessionNotifier taskbar dot`). No test was removed or weakened in the diff
- `git status --porcelain` in the real tree is unchanged from the start, apart from this report

---

## Follow-ups (smoke evidence, not production defects)

1. **F1 (Minor)**: smoke check 2 does not prove a second toast went out. Spy on `Notification.prototype.show` (or count `liveNotifications`) and require 2 toasts and 1 overlay call. Check 4 could also assert that no toast went out with notifications off, so it does not depend on check 3.
2. **F2 (Minor)**: edge case 2 (toast click) has evidence across two layers, but no check clicks a toast end to end. Hand-verify once by clicking a real toast while the dot is shown and watching the dot go. Alternatively, have the smoke call the spied `Notification`'s `click` handler.
3. **F3 (Minor)**: TBDT-05 is evidenced by code inspection only (`index.ts:678`). To test it, move the guard into a small pure helper (for example `overlayTarget(platform, window)`) and unit-test it. Otherwise accept it as thin shell, matching `revealWindow` (NOTF-21).
4. **F4 (Cosmetic)**: no automated check looks at the dot itself (red disc, readable at taskbar size) or at the packaged build. Hand-verify once on the local desktop build.

---

## Requirement Traceability Update (proposed; spec.md not edited by the Verifier)

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| TBDT-01 | Implementing | ✅ Verified |
| TBDT-02 | Implementing | ✅ Verified |
| TBDT-03 | Implementing | ✅ Verified |
| TBDT-04 | Implementing | ✅ Verified |
| TBDT-05 | Implementing | ✅ Verified (inspection; F3) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 4/5 ACs and all 3 edge cases are backed by assertions. TBDT-05 is backed by code inspection only (F3).
**Sensor**: 4/4 unit mutants killed. The author's 3 smoke mutants each failed the expected checks.
**Gate**: typecheck 0, 22/22 scoped tests passed, eslint 0.

**What works**: an OS toast sets one dot with the right description. In-app notices and switched-off states
never set it. Focus clears it, and a later toast sets it again.

**Next steps**: the owner decides whether F1 to F4 become follow-up tasks. No fix task blocks the merge.
