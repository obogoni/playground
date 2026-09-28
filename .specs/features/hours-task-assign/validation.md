# Hours Task Assign Validation

## Validation: hours-task-assign — PASS

**Date**: 2026-09-27 (round 1)
**Spec**: `.specs/features/hours-task-assign/spec.md` (HTSK-01..HTSK-43 and seven edge cases)
**Diff range**: `4f53b5e..28b0e95` (plan ends at `4f53b5e`; feature commits `abefd4c..28b0e95`, 31 commits); base branch `feature/hours-task-focus` (#129)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero

The Verifier found no production defect. All 43 ACs and the seven edge cases hold in the code. 42 ACs
have an automated assertion that targets the spec's outcome. HTSK-03 (the lookup runs only on an explicit
submit) holds by construction: the only call site is the submit path. No test asserts it, so it goes in
Follow-ups under the owner's budget rule 1.

Sensor results. Unit mutants: 38 injected, 34 killed. The four survivors are test gaps, not defects: the
1 s rule's second arm, the `false` and `null` values of `taskByHand`, and one equivalent mutant. Smoke
mutants: 5 injected, 4 killed. The survivor is a hand mark derived from the task id in place of the flag.
The drawer is correct; the smoke only has no row where the two differ. All survivors are Follow-ups.

The gates are green: typecheck 0, lint 0 errors and 18 warnings (the baseline), and 1795/1795 tests.
The focused smoke passes 21/21 on the unmodified tree, from a fresh seed and launch.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T31 | ✅ Done | `tasks.md`: 31 task headings, 73 `[x]`, 0 `[ ]` |

---

## Spec-Anchored Acceptance Criteria

Test paths are relative to the repo root. `smoke:N` means `scripts/smoke-hours-calendar.mjs:N` (the
line of the `check(` call). The Verifier re-ran every smoke check listed here, and each one passed on
the clean tree.

### P1: Pick a task

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HTSK-01 | Pins listed, first pin of an id only; `#{id}` + type pill + title with details, `#{id}` alone without | `src/renderer/src/lib/task-picker.test.ts:55-58`: `entry.label` `'#9201'`, `badgeType` `'User Story'`, `title`; `:70-73`: no details gives `badgeType`/`title` null; `:82`: `labels` `['#9201','#9202']` (repeat dropped); smoke:1327 reads the rendered labels `['From branch','#9201','#9202']` | ✅ PASS |
| HTSK-02 | A number or URL is fetched; one row reads `{type} #{id} {title}` | `src/main/task-board.test.ts:433-436`, `:444-447`: `lookup('4821')` and the URL form `toEqual({ ok: true, item: { id: 4821, type: 'Bug', title: 'Fix login redirect' } })`; `src/renderer/src/lib/task-picker.test.ts:91`: `entry.text` `'User Story #4821 Diagnose login loop'` | ✅ PASS (logic); rendered row checked by hand only |
| HTSK-03 | Azure DevOps reached only on Enter or `Look up`, never while typing | No test. By construction: `TaskPicker.tsx:73` is the only `tasks:lookup` call and sits inside `lookUp`. `lookUp` is called only from `onKeyDown` when `e.key === 'Enter'` (`:135-139`) and from the button's `onClick` (`:141`). `onChange` (`:130-134`) only sets state | ⚠️ By construction only; see Follow-ups |
| HTSK-04 | Choosing a looked-up item leaves the pinned list unchanged | `src/main/task-board.test.ts:457-458`: persisted `pinnedTasks` `toEqual([PIN_7])`, `board.list()` `toEqual({ ...before, auth: 'ok' })`; `:469`: an already-pinned id caches no details | ✅ PASS |
| HTSK-05 | Parse failure, unreachable or missing item show the pin path's text; nothing chosen | `src/main/task-board.test.ts:477-481`: `'Could not reach Azure DevOps — run az login and try again.'` and `auth` `'failed'`; `:489`: `'Work item #4821 not found in acme/platform.'`; `:498-499`: `'Paste a work item ID or ADO URL.'` with `source.calls` length 0 | ✅ PASS (texts); on screen, the error shows and nothing is chosen (`TaskPicker.tsx:76-77,154-158`), checked by hand only |
| HTSK-06 | The id and title are kept; the title is null when the pin has no details | `task-picker.test.ts:58`: choice `{ kind: 'task', id: 9201, title: 'Fix login redirect' }`; `:73`: `title: null`; `src/main/period-task.test.ts:70-72`: a null link title takes the pinned title, and null when nothing is pinned | ✅ PASS |

### P1: Link a session to a task

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HTSK-07 | The dialog's Task field starts on `From branch` | smoke:1416: `fromAgents === 'From branch'` | ✅ PASS |
| HTSK-08 | Opened from a pinned task card, Task starts on that task | smoke:1428: `fromCard === '#9202'` | ✅ PASS |
| HTSK-09 | A session spawned with a task records that task's id and title in every period | `src/main/time-tracker.test.ts:521-540`: open periods `toEqual` the `LINKED` fields (`taskId: 67890, taskTitle: 'Widget export', taskByHand: true`); `src/main/session-manager.test.ts:609-611`, `:619-620`: persisted `task` and `started` meta carry `LINK`; smoke:1463: `open3.taskId === 9201 && open3.taskByHand === true` | ✅ PASS |
| HTSK-10 | With no link, the period records the branch's task exactly as TIME-03 does | `time-tracker.test.ts:548-549`: `toMatchObject(SNAPSHOT)` and `'taskByHand' in open` false; `period-task.test.ts:39-40`; `src/renderer/src/lib/session-attribution.test.ts:37-66` | ✅ PASS |
| HTSK-11 | The link wins: periods, rail group and strip show the linked task | `time-tracker.test.ts:723-730` (link #12345 over a #67890 branch); `src/renderer/src/lib/rail-groups.test.ts:714`, `:725`: `groups.map(g => g.key)` `['task:4821']` / `['task:12345']`; `session-attribution.test.ts:71-107`; smoke:1337 (`group1.id === '#9201'`), smoke:1481, smoke:1387 (`strip === '#9201'`) | ✅ PASS |
| HTSK-12 | A change closes the open period and opens the new one at the same instant | `time-tracker.test.ts:560-582`: appended `end: iso(T0 + 10*MIN)`, new open `start: iso(T0 + 10*MIN)` with `LINKED`; `:604-605`: on a clock that advances each read, `open.start` `toBe(store.appended[0].end)`; smoke:1345: `previous.end === open1.start` | ✅ PASS |
| HTSK-13 | From branch removes the link; the next period records the branch's task | `time-tracker.test.ts:634-639`; `session-manager.test.ts:641-643`: `not.toHaveProperty('task')`; smoke:1387 (`!('task' in saved3)`, `open3.taskId === null`), smoke:1496 (`open4.taskId === 9202`, no flag) | ✅ PASS |
| HTSK-14 | Choosing the already-linked task neither closes nor opens | `time-tracker.test.ts:620-624`: `appended` `[]`, snapshot unchanged, no emit, no sidecar write; smoke:1371: `closedAfter === closedBefore && open2.id === open1.id` | ✅ PASS (see spec-precision gap 1) |
| HTSK-15 | While paused or suspended, no period opens; the next open carries the new task | `time-tracker.test.ts:651-658` (paused), `:670-677` (suspended): `openOf(t)` `[]`, then the resume and the wake open with `LINKED` | ✅ PASS |
| HTSK-16 | A stopped session's link is saved; the next run records it | `session-manager.test.ts:656-659`: persisted `task`, `status` `'stopped'`, no new PTY; `:674-676`: respawn hands `[view.id, LINK]` to the tracker; `time-tracker.test.ts:692-694`: no run, no change | ✅ PASS |
| HTSK-17 | The link is saved in the config and restored after a restart and on respawn | `session-manager.test.ts:672-676`: a second `ConfigStore` over the same dir lists the `task`, and respawn starts with it; smoke:1357: `saved.task.id === 9201` | ✅ PASS; a real app restart is checked by hand only |
| HTSK-18 | The strip shows the task (`#id`, pills, title, or `No task`), also detached, and opens the picker with From branch, the pins and the lookup | `session-attribution.test.ts:80-88`: a detached cwd with a link gives `taskId` 4821; `task-picker.test.ts:29-30`: the session set is `['From branch','#9201','#9202']` with no `none`; smoke:1387: the strip of the detached session reads `#9201` and its From branch works | ✅ PASS; the `No task` text on the strip is not asserted |
| HTSK-19 | Right-click on a rail row shows a menu whose `Change task…` opens the picker | smoke:1327: `items` `['Change task…']`, and the picker's entries follow | ✅ PASS (synthetic `contextmenu`; see Follow-ups) |
| HTSK-20 | A linked task with no pinned details shows the link's title in the header, else the branch | `rail-groups.test.ts:756-759`: `title` `'Diagnose login loop'`, `ariaLabel` `'#4821 Diagnose login loop'`; `:770-772`: title null, `ariaLabel` `'#4821 develop'`; `:786` first linked session wins | ✅ PASS (model); the rendered header text is not smoke-checked |
| HTSK-21 | A linked session's notification names the linked task | `src/main/session-notifier.test.ts:204-217`: `lookups` `[]`, title `'#4821 · Diagnose login loop'`; `session-manager.test.ts:1211`: `changes.map(c => c.task)` `[null, { id: 4821, … }]` | ✅ PASS |
| HTSK-22 | A duplicated linked session keeps the link | `session-manager.test.ts:686-688`: the copy's persisted `task` `LINK`, `started` `[[copy.id, LINK]]` | ✅ PASS |

### P1: Fix a period after the fact

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HTSK-23 | A closed row offers `Change task` and `Split at` beside Edit and Delete | smoke:1267: `closed.every(r => r.change && r.split)` | ✅ PASS |
| HTSK-24 | The drawer picker offers `No task`, `From branch`, the pins and the lookup | `task-picker.test.ts:36`: `['No task','From branch','#9201','#9202']`; `PeriodRow.tsx` passes `noTask` | ✅ PASS |
| HTSK-25 | The period records the chosen id and title; every other field is unchanged | `time-tracker.test.ts:780-791`: `rewrites` `toEqual([[expected, other]])`, other fields matched one by one; smoke:1203: group `Task #9201` `1h00` | ✅ PASS |
| HTSK-26 | No task records a null id and a null title | `time-tracker.test.ts:801-803`: `{ ...onBranch, taskId: null, taskTitle: null, taskByHand: true }`; `period-task.test.ts:134-136` | ✅ PASS |
| HTSK-27 | From branch: the stored branch's id (none for a null branch), its pinned title or null, no flag | `time-tracker.test.ts:813-814`: `rewrites` `[[onBranch]]`, no `taskByHand` key; `period-task.test.ts:146-147`, `:157-158` (null branch gives null/null); smoke:1241 | ✅ PASS |
| HTSK-28 | `[start, at]` keeps the id, `[at, end]` gets a new id; both copy the task and every field | `time-tracker.test.ts:877-884`: `[before, { ...morning, end: at(10) }, { ...morning, id: 'p1', start: at(10) }, after]`; smoke:1187 | ✅ PASS |
| HTSK-29 | A time not strictly inside shows `Split time must be inside the period.`; the log is unchanged | `time-tracker.test.ts:909-912,927-931` (at start, at end, before, after): `{ ok: false, error }`, `rewrites` `[]`; smoke:1171 | ✅ PASS |
| HTSK-30 | A part under 1 s shows `Each part must last at least 1 second.`; the log is unchanged | `time-tracker.test.ts:913-918,927-931` (1.5 s period split in the middle); `:891-898` (boundaries start+1 s and end−1 s accepted) | ✅ PASS; the second arm alone is untested (U12, Follow-ups) |
| HTSK-31 | An invalid date shows `Split time must be a valid date.`; the log is unchanged | `time-tracker.test.ts:919,927-931`; `PeriodRow.tsx` shows the same text for an unparsable field | ✅ PASS |
| HTSK-32 | An open or missing period gets `This period is still open.` / `This period no longer exists.` | `time-tracker.test.ts:834-845` (reassign), `:940-948` (split) | ✅ PASS |
| HTSK-33 | The field opens on the midpoint, rounded down to the second, in local time | `src/renderer/src/lib/period-edit.test.ts:20`, `:24-25`, `:29`, `:33`: `splitDefault(...)` `toBe('2026-09-21T10:30:00')` / `…T09:00:01` (floored); smoke:1156: `new Date(field)` equals 10:30 | ✅ PASS |
| HTSK-34 | A running row offers neither `Change task` nor `Split at` | smoke:1267: `running.every(r => !r.change && !r.split)` | ✅ PASS |
| HTSK-35 | The log is rewritten atomically; the drawer regroups without a manual refresh | `time-tracker.test.ts:780,792`, `:883-885`: one `rewrite` of the full list plus one emit; the atomic write itself is `time-log-store.test.ts:95` (TIME-48); smoke:1203, smoke:1226 (the drawer regroups with no reload) | ✅ PASS |

### P1: See which tasks were set by hand

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HTSK-36 | A hand-set task (a link, or a drawer task or `No task`) that differs from the branch's records `taskByHand: true` | `period-task.test.ts:50-55`, `:89-94` (null branch), `:106`, `:134`; `time-tracker.test.ts:728`; smoke:1345, smoke:1463 | ✅ PASS |
| HTSK-37 | Equal to the branch's task, or From branch, records no flag | `period-task.test.ts:82-83`, `:122-123`, `:135-136`, `:146-147`: `'taskByHand' in fields` false; `time-tracker.test.ts:823-824`; smoke:1241, smoke:1496 (`!('taskByHand' in open4)`) | ✅ PASS |
| HTSK-38 | A flagged row shows a mark titled `Assigned by hand (branch: {branch})` or `(no branch)` | `period-edit.test.ts:10`, `:14`: the exact literals; smoke:1214: `markedRow.hand.title === 'Assigned by hand (branch: develop)'` and the No-task row has none | ✅ PASS; a mark driven by the task id instead of the flag passes the smoke (S2, Follow-ups) |
| HTSK-39 | The `branch` field is never rewritten | `time-tracker.test.ts:782-783` (`branch: onBranch.branch` after reassign), `:877-884` (split copies it); smoke:1187 (`parts.every(p => p.branch === 'develop')`), smoke:1241 (`seedAfter.branch === 'develop'`) | ✅ PASS |

### P1: Reports follow the task, old logs still read

| AC | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| HTSK-40 | Card total, rail total, calendar and legend, drawer groups and Copy group by the recorded task id | `src/renderer/src/lib/hours-report.test.ts:238-241`, `:260`: groups `['task:4821', …]` / `['task:12345']` whatever the branch; `time-totals.test.ts:136-145` (`taskTotalMs` filters on `period.taskId`, unchanged); `hours-copy.ts:15` builds from `day.groups`; smoke:1203, smoke:1226 (legend chips) | ✅ PASS |
| HTSK-41 | A line without `taskByHand` reads as a period with no flag | `src/main/time-log-store.test.ts:231-233`: `skipped` 0, `periods` `[period('a')]`, no key | ✅ PASS |
| HTSK-42 | Lines keep `v: 1`; `taskByHand` is written only when true | `time-log-store.test.ts:222`: `JSON.parse(line)` `toEqual({ v: 1, ...flagged })`; `:259-260`: an unflagged line is byte-identical to the old format, with no `taskByHand` | ✅ PASS |
| HTSK-43 | A non-boolean `taskByHand` skips the line as invalid | `time-log-store.test.ts:249-253`: `'yes'` skipped, `skipped: 1`, logged once | ✅ PASS; `null` and `false` are not asserted (U19, U20, Follow-ups) |

**Status**: 42/43 ACs have test evidence that matches the spec outcome; HTSK-03 holds by construction only.

---

## Edge Cases

- [x] A link to #12345 in a worktree naming #67890 records #12345 with the flag, under #12345: `time-tracker.test.ts:711-731`, `rail-groups.test.ts:718-726`
- [x] A linked task later unpinned keeps the stored id and title: the period stores the title at open time (`period-task.test.ts:50-55`), and the rail shows the link's title with no pins (`rail-groups.test.ts:748-760`)
- [x] A link change under 1 s after an open discards that part and opens the new period: `time-tracker.test.ts:704-708`
- [x] A split across midnight keeps exact instants: `time-tracker.test.ts:951-963`; counting per day is TIME-32, unchanged (`hours-report.test.ts:163`)
- [x] A lookup of an already-pinned item returns it like any other: `task-board.test.ts:461-470`
- [x] A split at exactly start + 1 s and end − 1 s succeeds: `time-tracker.test.ts:888-899`
- [x] A task new to the shown week wears Other until the week is reopened: HCAL-24 is unchanged, `hours-calendar.test.ts:394` (pre-existing); smoke:1203 reads the chip by label only

---

## Discrimination Sensor

**Isolation**: unit mutants ran in a scratch `git worktree` at `28b0e95` (`npm ci --ignore-scripts`), one
at a time, each restored in `finally`. Smoke mutants were applied to the real tree by a script that kept
a `.orig` copy outside the repo, asserted that the anchor matched exactly once, and restored the file in
`finally`. Each smoke run used a fresh `--seed` and a fresh launch with a throwaway `--user-data-dir`.
`git status --porcelain` was empty before the sensor, after each smoke run, and after the scratch worktree
was removed.

### Unit mutants (38 injected, 34 killed, 4 survived)

| # | Where | Mutation | Verdict | Killed by |
| - | ----- | -------- | ------- | --------- |
| U1 | `src/main/period-task.ts:22` | drop `task.id === snapshot.taskId` (flag even when equal to branch) | ✅ Killed | `period-task.test.ts` "records no flag when the link names the task the branch already names (HTSK-37)" |
| U2 | `period-task.ts:26` | `task.title ?? pinnedTitle(id)` → `task.title` | ✅ Killed | `period-task.test.ts` HTSK-06; `time-tracker.test.ts` HTSK-09/11 |
| U3 | `period-task.ts:50` | always add `taskByHand: true` | ✅ Killed | `period-task.test.ts` HTSK-37 cases; `time-tracker.test.ts` "removes the flag key…" |
| U4 | `period-task.ts:45` | From branch keeps the old title | ✅ Killed | `period-task.test.ts` HTSK-27 (both); `time-tracker.test.ts` HTSK-27 |
| U5 | `period-task.ts:42` | `kind === 'branch'` → `kind === 'none'` | ✅ Killed | HTSK-26 and HTSK-27 tests |
| U6 | `src/main/time-tracker.ts:97` | same-link test by object identity | ✅ Killed | "changes nothing when the link is the one the session already has (HTSK-14)" |
| U7 | `time-tracker.ts:98` | drop `run.task = task` | ✅ Killed | HTSK-12, HTSK-13, HTSK-15 (both) |
| U8 | `time-tracker.ts:102` | reopen with a second clock read (the T30 defect) | ✅ Killed | "ends the old period and starts the new one at one instant while the clock moves (HTSK-12)" |
| U9 | `time-tracker.ts:101` | drop the `#close` on change | ✅ Killed | HTSK-12 (both), HTSK-13 |
| U10 | `time-tracker.ts:220` | keep the old flag on reassign (`...p` for `...rest`) | ✅ Killed | "restores … removes the flag key for From branch", "removes the flag key when the branch's own task is chosen" |
| U11 | `time-tracker.ts:239` | `<=`/`>=` → `<`/`>` in the inside check | ✅ Killed | split rejection cases "at the start", "at the end" |
| U12 | `time-tracker.ts:242` | 1 s rule `\|\|` → `&&` | ❌ Survived | none: the only short case has both parts under 1 s (Follow-ups) |
| U13 | `time-tracker.ts:242` | `<` → `<=` on the first part | ✅ Killed | "splits at exactly start + 1 s and at exactly end - 1 s" |
| U14 | `time-tracker.ts:248-249` | the two parts in swapped order | ✅ Killed | HTSK-28 in-place test, boundaries, midnight |
| U15 | `time-tracker.ts:249` | second part loses `taskByHand` | ✅ Killed | HTSK-28 in-place test |
| U16 | `time-tracker.ts:80` | `started` ignores `meta.task` | ✅ Killed | HTSK-09, HTSK-11, HTSK-13, HTSK-14 |
| U17 | `time-tracker.ts:234` | drop the NaN check | ✅ Killed | split rejection "an invalid date" |
| U18 | `src/main/time-log-store.ts:28` | drop the `taskByHand` type check | ✅ Killed | "skips and counts a line whose taskByHand is not a boolean (HTSK-43)" |
| U19 | `time-log-store.ts:28` | accept only `true` (skip `false`) | ❌ Survived | none: no line with `taskByHand: false` is read (Follow-ups) |
| U20 | `time-log-store.ts:28` | `=== undefined` → `== null` (accept `null`) | ❌ Survived | none: no line with `taskByHand: null` is read (Follow-ups) |
| U21 | `src/main/session-manager.ts:186` | `setTask` does not tell the tracker | ✅ Killed | HTSK-12, HTSK-13 manager tests |
| U22 | `session-manager.ts:185` | `setTask` does not patch the live meta | ✅ Killed | "reports the task set by setTask on the next transition (HTSK-21)" |
| U23 | `session-manager.ts:202` | duplicate drops the link | ✅ Killed | "duplicate of a linked session… (HTSK-22)" |
| U24 | `session-manager.ts:71` | `withTask(null)` keeps the key | ✅ Killed | "setTask(id, null) removes the task key… (HTSK-13)" |
| U25 | `session-manager.ts:457` | `ActivityChange.task` always null | ✅ Killed | HTSK-21 manager test |
| U26 | `session-manager.ts:146` | ad-hoc spawn drops the task | ✅ Killed | "an ad-hoc spawn with a task persists it… (HTSK-09, HTSK-17)" |
| U27 | `src/main/task-board.ts:177` | lookup failure does not mark auth failed | ✅ Killed | "returns the pin path text and marks auth failed… (HTSK-05)" |
| U28 | `task-board.ts:185` | lookup pins the item | ✅ Killed | HTSK-04 (both) |
| U38 | `task-board.ts:180` | lookup success does not mark auth ok | ✅ Killed | "leaves the pinned list and the snapshot as they were, but for the auth state (HTSK-04)" |
| U29 | `src/main/session-notifier.ts:44` | branch lookup wins over the link | ✅ Killed | "titles the notification with the linked task and never looks the branch up (HTSK-21)" |
| U30 | `src/renderer/src/lib/session-attribution.ts:28` | link wins only when detached | ✅ Killed | `session-attribution.test.ts` link cases; `rail-groups.test.ts` HTSK-11 |
| U31 | `src/renderer/src/lib/rail-groups.ts:207` | last linked session's title wins | ✅ Killed | "takes the title from the group's first linked session, even when it has none" |
| U32 | `rail-groups.ts:255` | aria-label ignores the link title | ✅ Killed | "carries an unpinned link's title, and names the group by it" |
| U33 | `src/renderer/src/lib/task-picker.ts:57` | repeated ids not dropped | ✅ Killed | "keeps only the first pin of a repeated id" |
| U34 | `task-picker.ts:65` | pin choice with a null title | ✅ Killed | "shows a pin with details as #id… and chooses both" |
| U35 | `task-picker.ts:75` | row text `#{id} {type} {title}` | ✅ Killed | "reads {type} #{id} {title}…" |
| U36 | `src/renderer/src/lib/period-edit.ts:25` | `Math.floor` → `Math.round` | ✅ Killed | "floors a midpoint at the half second…", "…above the half second" |
| U37 | `period-edit.ts:18` | `branch === null` → `!branch` | ❌ Survived | equivalent: a recorded branch is never `''` |

### Smoke mutants (5 injected, 4 killed, 1 survived) — `SMOKE_ONLY=assign`, baseline 21/21

| # | Where | Mutation | Risk | Verdict | Failed checks |
| - | ----- | -------- | ---- | ------- | ------------- |
| S1 | `src/renderer/src/components/PeriodRow.tsx` `reassign` | every drawer choice is sent as `{ kind: 'none' }` | time booked to the wrong task | ✅ Killed (17/21) | smoke:1203, :1214, :1226, :1241 |
| S2 | `PeriodRow.tsx` hand mark | mark shown when `taskId !== null` instead of `taskByHand === true` | a hand mark that lies | ❌ Survived (21/21) | none: section 13 has no row where a task and no flag (or a flag and no task) meet |
| S3 | `src/main/index.ts` `sessions:spawn` handler (main; fresh launch) | `task` not passed to `SessionManager.spawn` | live time booked to the branch's task | ✅ Killed (18/21) | smoke:1463, :1481, :1496 |
| S4 | `src/renderer/src/components/AgentsView.tsx` `chooseTask` | From branch on the strip keeps the current link | the link cannot be removed | ✅ Killed (19/21) | smoke:1387, :1496 |
| S5 | `src/renderer/src/lib/use-sessions.ts` `setSessionTask` | no session refetch after `sessions:set-task` | the rail does not follow a change | ✅ Killed (18/21) | smoke:1337, :1387, :1496 |

**Sensor depth**: expanded (data integrity: log format and period edits). Unit 34/38 killed; smoke 4/5
killed. Every survivor is a test gap or an equivalent mutant, not a production defect.

---

## Gate Check

- **Gate command**: `npm run typecheck && npm run lint && npm test`
- **Typecheck**: exit 0
- **Lint**: exit 0, 0 errors, 18 warnings (the baseline)
- **Tests**: 1795 passed, 0 failed, 0 skipped (95 files)
- **Test count before the feature** (`4f53b5e`, run in the scratch worktree): 1704 tests in 91 files
- **Delta**: +91 tests, +4 files. No test was removed or weakened in the diff.
- **Focused smoke** on the unmodified tree, fresh seed and launch: 21/21

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code: one pure `period-task.ts` holds the flag rule for both paths | ✅ |
| Surgical changes: renderer changes are props threading plus three surfaces; `index.ts` factors the pinned-title map once | ✅ |
| No scope creep: no pinning from the lookup, no type or state stored, the branch field is never written | ✅ |
| Matches patterns: `reassignPeriod` and `splitPeriod` follow `adjustPeriod` (`#editTarget`, `#rewritten`); `setTask` follows `rename`; the context menu follows the sidebar's | ✅ |
| Spec-anchored outcome check (asserted values match the spec) | ✅ (HTSK-03 by construction) |
| Per-layer coverage: domain logic 1:1 with ACs; renderer decisions in unit-tested libs (AD-004) | ✅ |
| Every new test maps to an HTSK AC, an edge case or a Done-when | ✅ |
| Documented guidelines followed: `.specs/STATE.md` decisions (AD-004, AD-021, AD-023), the smoke falsification rules in `tasks.md` | ✅ |

---

## Follow-ups

These items do not affect the verdict (owner budget rule 1). They are ordered by risk.

1. **HTSK-30, second arm untested (U12).** Add a `splitPeriod` case where only one part is under
   1 s, e.g. 09:00:00.500 in 09:00–12:00, expecting `Each part must last at least 1 second.`. Today
   `||` → `&&` survives. Production code is correct (`time-tracker.ts:242`).
2. **Hand mark driven by the flag, not the task (S2).** Add a row that tells the flag and the task
   apart, e.g. a drawer period moved to its branch's own task (task set, no flag) that must show no
   mark. Or assert the mark on a flagged `No task` row. Production code reads `taskByHand === true`
   (`PeriodRow.tsx`), as HTSK-38 requires.
3. **HTSK-43, `false` and `null` values (U19, U20).** Add store cases: a line with
   `taskByHand: false` is read (it is a boolean), and one with `taskByHand: null` is skipped. The app
   never writes either value, so the risk is limited to hand-edited or foreign logs.
4. **HTSK-03 has no automated check.** The lookup runs only on Enter or `Look up` by construction
   (`TaskPicker.tsx:73,135-141`). It stays on the hand-verify list with the rest of the typed lookup
   (HTSK-02 row, HTSK-05 on screen), since the smoke must never drive it.
5. **Thin smoke evidence, as the author flagged.** 14.2 opens the menu with a synthetic `contextmenu`
   event. Pickers are clicked with `.click()`, so closing on an outside press is never exercised. 13.9
   builds its closed row by pause and resume. Still checked by hand only: a real restart (HTSK-17), the
   notification text (HTSK-21, logic unit-tested), the strip's `No task` text (HTSK-18), the rail header
   showing the link title (HTSK-20, model unit-tested), and the mark's look in both themes (HTSK-38).
6. **The seeded `acme/platform` pins trigger a real details fetch on focus**, and the checks rely on it
   failing. Harmless today. It would change what the smoke reads if that org ever resolved.

---

## Spec-Precision Gaps

1. **HTSK-14 names only a linked task.** An unlinked session on a task branch that is linked to that
   same task still closes and reopens its period: `run.task` is null, so the ids differ
   (`time-tracker.ts:97`). The two periods are identical apart from the boundary, with no flag. The
   spec's "already linked to" allows this, and the Assumptions row "Linking the task the session
   already has" reads as though it should be a no-op. The owner should decide which reading holds.
2. **A title-only change is silent.** Relinking the same id with a different title changes nothing in
   the tracker (`time-tracker.test.ts:617`), while the session saves the new title. The open period
   keeps the old one until the next open. The spec says nothing either way.
3. **T8 Done-when versus design.** `lookup` updates `auth` like `pin` does, so `list()` changes in
   `auth` only. HTSK-04 only requires the pinned list to stay unchanged, which holds. The Done-when
   wording was stricter than the spec.
4. **Picker order.** The spec fixes no order. The code lists `No task`, `From branch`, then the pins;
   the design listed From branch first. It is consistent on every surface and asserted by
   `task-picker.test.ts:36`.
5. **HTSK-02 `{type}`.** The lookup row shows the item's own type (a Task reads `Task`). A pin's pill
   shows the parent's type (BPTK-01). The spec says `{type}`, which the code matches, but the two
   surfaces can show different words for the same item.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| HTSK-01..02, 04..43 | Implemented | ✅ Verified |
| HTSK-03 | Implemented | ✅ Verified by construction (hand-verify) |

---

## Summary

**Overall**: ✅ Ready. There is no production defect and no AC without evidence.

**Spec-anchored check**: 42/43 ACs have a matching test assertion; HTSK-03 holds by construction; 5
spec-precision gaps.
**Sensor**: unit 34/38 killed (3 test gaps, 1 equivalent); smoke 4/5 killed (1 test gap).
**Gate**: 1795 passed, typecheck 0, lint 0 errors and 18 warnings; focused smoke 21/21.

**Next steps**: the three test gaps in Follow-ups 1–3 are cheap and worth one small test-only task
before the PR. The owner should decide spec-precision gap 1.
