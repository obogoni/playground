# Hours Drawer Growth Specification

## Problem Statement

In the Hours direction, a day with many tasks does not fit the drawer, and the day card stops where
the drawer ends: the groups below spill out of the card's background and border while the drawer
scrolls them. The card is a flex item of the drawer's column (`.hours-drawer`, `flex-direction:
column`, `overflow-y: auto`) with `min-height: 100%` and no `flex: none`, so flex shrinks it to the
drawer's height and its content overflows it. It is a defect of `hours-calendar` (PR #99),
fixed inside that branch before the PR merges. Tracked upstream as issue #105.

The smoke that should have caught it cannot: `scripts/smoke-hours-calendar.mjs` attaches to a dev
app running on the owner's real `%APPDATA%\playground`, whose days are never guaranteed to be tall.
Proving the fix needs a day that overflows, and producing one must not touch the owner's data.

## Goals

- [ ] A day card encloses all of its groups, however many there are, and the drawer scrolls the card as one unit
- [ ] The Hours smoke runs on a throwaway data directory seeded with a tall day, and refuses to run on anything else

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| A sticky day header (date, total, Copy) while the groups scroll | Owner decision (grill Q1): a layout change, not the defect. The AD-031 layout stays |
| Automating the task-slot colours (HCAL-11) and the `N tasks` summary wording | Owner decision (grill Q10): the seed makes both reachable; noted for M4, which reworks the colours |
| Seeding the owner's real `%APPDATA%\playground` | Owner decision (grill Q6): a failed cleanup would leave fake tasks in real hours |
| A new smoke script | Owner decision (grill Q7): the existing Hours smoke is extended |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| What scrolls when the day is tall | The whole card, header included, inside the drawer | Owner decision (grill Q1) | y |
| A short day | The card still fills the drawer's height (`min-height: 100%` stays) | Owner decision (grill Q2): the current look | y |
| Where the fix lands | A commit on `feature/hours-calendar` (draft PR #99), fast-forward push to `fork`, merged into `develop` | Owner decision (grill Q3). Pushing and merging are gated on the owner's go-ahead at that moment | y |
| How the fix is proven | A CDP check in `smoke-hours-calendar.mjs`, run first against the current CSS and seen to FAIL | Owner decision (grill Q4); a check never seen failing proves nothing (project memory: smoke checks that cannot fail) | y |
| Where the tall day comes from | Fictitious closed periods written by the smoke's `--seed` mode into a new temporary userData directory, before the app starts | Owner decisions (grill Q5, Q6). The time log is read once at start-up and the in-memory list is authoritative (`TimeLogStore`, TIME-14), so seeding a running app is invisible and is overwritten by its next rewrite | y |
| Which day holds the seed | **Sunday of the previous week** | Owner asked for a Saturday or Sunday, easy to spot and clean by hand. The current week's weekend is in the future on any weekday; last week's Sunday is always past, and the existing checks use the current week (steps 1–8) and week −4 (step 9), neither of which it touches | y |
| How the smoke reaches the seeded directory | `--seed` prints the directory and the dev command, and records the directory in `%TEMP%\playground-smoke-hours.last`; the normal run reads that file | The run is a separate process started after the owner launches the app; a pointer file avoids retyping a path | y |
| How the dev app is pointed at the directory | `npm run dev -- -- --user-data-dir=<dir> --remote-debugging-port=9222`, verified first (T1) | Chromium's switch; whether Electron derives `app.getPath('userData')` from it is not documented for Electron 39 and is measured rather than assumed | y — T1 measured 2026-09-25: honoured |
| If Electron ignores `--user-data-dir` | The main process reads `PLAYGROUND_USER_DATA` and calls `app.setPath('userData', …)` only when `!app.isPackaged` | Owner decision (grill Q9) | y |
| Whole smoke isolated | Every step (1–10) runs on the seeded directory; the smoke fails before any other check when the seed is not in `time:snapshot` | Owner decision (grill Q8): a step that skips when its data is missing can pass without proving anything | y |
| Clean-up | On all checks passing, the smoke closes the app (`Browser.close`) and deletes the directory; on any failure it leaves both and prints the directory | Owner decision (grill Q11). The directory cannot be deleted while Electron holds its profile files open, so the app has to go first | y |
| Seed size | 14 periods of 20 minutes, 08:00 to 12:40 local, one per fictitious task (`taskId` 9101..9114, titles like `Fix login redirect`) | 14 groups overflow a 1100 × 640 drawer with margin; distinct tasks make 14 groups. Fictitious data only: the repository is public | y |

**Open questions:** none — all resolved or logged above. The `--user-data-dir` row is settled by T1's measurement, with its fallback already decided.

---

## User Stories

### P1: A tall day stays inside its card ⭐ MVP

**User Story**: As the owner reading a busy day's hours, I want the day card to hold every group so that the detail reads as one card and not as rows floating past its border.

**Why P1**: It is the defect.

**Acceptance Criteria**:

1. WHEN the selected day's content is taller than the drawer THEN the day card SHALL extend to at least the bottom of its last group (`card.bottom >= lastGroup.bottom`, and `card.scrollHeight <= card.clientHeight + 1`)
2. WHEN the selected day's content is taller than the drawer THEN the drawer SHALL scroll (`drawer.scrollHeight > drawer.clientHeight`), and scrolling it to the end SHALL bring the card's bottom border to the bottom edge of the drawer's visible area (`|card.bottom - drawer.bottom| <= 1`). *Precision added at Execute (T6): with the defect the card's border also enters the visible area, above the groups that spill past it, so "into the visible area" alone does not tell the two apart.*
3. WHILE the selected day's content is shorter than the drawer the day card SHALL fill the drawer's height (`card.height >= drawer.clientHeight - 1`)
4. WHILE a tall day is open at 1100 × 640 the Hours page SHALL NOT scroll (`.hours-body` `scrollHeight <= clientHeight + 1`) — HCAL-26 still holds

**Independent Test**: Open the seeded Sunday at 1100 × 640 and read the four geometry values above.

---

### P1: The Hours smoke runs on seeded, throwaway data ⭐ MVP

**User Story**: As the owner running the Hours smoke, I want it to bring its own tall day in a throwaway directory so that it can prove the drawer fix without ever writing to my real hours.

**Why P1**: Without a tall day, criterion 1 of the story above cannot be observed; without isolation, observing it costs the owner's data.

**Acceptance Criteria**:

5. WHEN `node scripts/smoke-hours-calendar.mjs --seed` runs THEN it SHALL create a new directory under `%TEMP%`, write in it a `time-log.jsonl` holding exactly the 14 seeded periods on the previous week's Sunday, record the directory in `%TEMP%\playground-smoke-hours.last`, print the dev command to launch against it, and exit 0 without contacting any app
6. IF `--seed` finds that the directory it is about to use already exists THEN it SHALL stop with a non-zero exit and write nothing
7. WHEN the smoke runs without `--seed` THEN, before any other check, it SHALL confirm that every seeded period id is in `time:snapshot`
8. IF any seeded period id is missing from `time:snapshot`, or `%TEMP%\playground-smoke-hours.last` is absent THEN the smoke SHALL exit non-zero with the message `not running on the seeded data` and SHALL NOT spawn a session or write anything through IPC
9. WHEN every check passes THEN the smoke SHALL close the app and delete the seeded directory and the pointer file
10. IF any check fails THEN the smoke SHALL leave the app, the directory and the pointer file in place and print the directory
11. The smoke's steps 1–9 SHALL pass unchanged on the seeded directory

---

### P2: A dev-only userData override (only if T1 finds `--user-data-dir` ignored)

**User Story**: As the owner, I want a way to start the dev app on another data directory so that the smoke can isolate itself.

**Why P2**: Needed only when Chromium's switch does not reach `app.getPath('userData')`.

**Acceptance Criteria**:

12. WHERE the app is not packaged and `PLAYGROUND_USER_DATA` is a non-empty string, the main process SHALL set `userData` to that path before any store reads it
13. WHILE the app is packaged the main process SHALL ignore `PLAYGROUND_USER_DATA`
14. IF `PLAYGROUND_USER_DATA` is unset or empty THEN `userData` SHALL stay Electron's default

---

## Edge Cases

- WHEN the smoke runs early on a Monday THEN the seeded Sunday SHALL still be a past, complete day (it is in the previous week by construction)
- IF the owner launches the installed app while the dev app runs on the seeded directory THEN the installed app is unaffected: it uses its own default directory (a consequence of AC 5, not a new behaviour)
- IF the smoke is killed mid-run THEN the directory and pointer file remain; the next `--seed` creates a new directory with a new timestamp and overwrites the pointer (AC 6 covers only a clash of the same directory)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| HDRW-01 | P1: tall day stays inside its card — AC 1 | Execute | Verified |
| HDRW-02 | P1: tall day — AC 2 | Execute | Verified |
| HDRW-03 | P1: tall day — AC 3 | Execute | Verified |
| HDRW-04 | P1: tall day — AC 4 | Execute | Verified |
| HDRW-05 | P1: seeded smoke — AC 5 | Execute | Verified |
| HDRW-06 | P1: seeded smoke — AC 6 | Execute | Verified |
| HDRW-07 | P1: seeded smoke — AC 7 | Execute | Verified |
| HDRW-08 | P1: seeded smoke — AC 8 | Execute | Verified |
| HDRW-09 | P1: seeded smoke — AC 9 | Execute | Verified |
| HDRW-10 | P1: seeded smoke — AC 10 | Execute | Verified |
| HDRW-11 | P1: seeded smoke — AC 11 | Execute | Verified |
| HDRW-12 | P2: dev-only override — AC 12 | Tasks | N/A — T1: switch honoured |
| HDRW-13 | P2: dev-only override — AC 13 | Tasks | N/A — T1: switch honoured |
| HDRW-14 | P2: dev-only override — AC 14 | Tasks | N/A — T1: switch honoured |

**Coverage:** 14 total, 14 mapped to tasks, 0 unmapped.

---

## Success Criteria

- [x] The smoke's drawer check FAILS on the CSS before the fix and PASSES after it
- [x] A full smoke run leaves `%APPDATA%\playground\time-log.jsonl` byte-identical to before it
