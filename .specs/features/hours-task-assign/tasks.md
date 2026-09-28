# Hours Task Assign Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/hours-task-assign/design.md`
**Status**: Draft (planned 2026-09-26, awaiting owner approval)

**Branch**: `feature/hours-task-assign`, cut from `feature/hours-task-focus` `5342e37` (PR #129, stacked on `feature/hours-calendar` = PR #99). The PR body carries `Closes #133` and "depends on #129". PR #98 (`feature/session-strip-polish`) is not in this base; its conflict hotspots are listed in the spec's Assumptions table.

**Setup (before T1, no commit)**: the worktree has no `node_modules`. Run `npm ci --ignore-scripts` and `node node_modules/electron/install.js`, then record the **test baseline** here: `npx vitest run` count, `npm run typecheck`, and `npm run lint` errors and warnings.

**Owner-to-confirm rows** (spec Assumptions): the rail row gesture, the mark rule, no `No task` for sessions, duplicate keeps the link, the no-branch tooltip, Other colour after an edit. The plan is built on the recommended defaults; a different answer changes only the tasks named in that row's notes below.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `.specs/codebase/TESTING.md`, `vitest.config.ts`, `package.json` scripts, the `hours-task-focus` matrix, confirmed lessons L-001 and L-005, candidate lessons L-012, L-018, L-021, L-030, L-031, L-036, L-042, L-043, L-045, L-048, L-050..L-055.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Main deep modules (`TimeLogStore`, `TimeTracker`, `SessionManager`, `SessionNotifier`, `TaskBoard`) | unit | 1:1 to the HTSK ACs each owns; every listed edge case; persisted state asserted after each transition (L-036) | `src/main/<module>.test.ts` | `npx vitest run src/main/<module>.test.ts` |
| Main pure helper (`period-task.ts`) | unit | Every branch of the flag rule; both sides of the branch-equality test | `src/main/period-task.test.ts` | `npx vitest run src/main/period-task.test.ts` |
| Renderer pure libs (`session-attribution`, `rail-groups`, `task-picker`, `period-edit`, `hours-report`) | unit | 1:1 to HTSK-01, 02, 11, 18, 20, 24, 33, 38, 40; rounding on both sides of the half (L-043) | `src/renderer/src/lib/<module>.test.ts` | `npx vitest run src/renderer/src/lib/<module>.test.ts` |
| IPC contract and `index.ts` wiring | none (thin shell) | Typecheck; exercised end to end by the smoke | — | `npm run typecheck` |
| Renderer hooks (`use-time`, `use-sessions`) | none (thin shell) | Typecheck; smoke | — | `npm run typecheck` |
| Components and CSS | none (CDP smoke) | HTSK-07, 08, 11, 12, 14, 17, 18, 19, 23, 28, 29, 33, 34, 36, 38, 39 in the running app | — | `node scripts/smoke-hours-calendar.mjs` |
| Docs (`STATE.md`, sibling specs) | none | — | — | review |
| End to end | manual CDP smoke | Every new check first seen failing on a deliberately broken build | `scripts/smoke-hours-calendar.mjs` | seeded dev app, three steps (T28) |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After a task whose only tests are unit tests | `npx vitest run <the task's test file>` then `npm test` |
| Full | After a code task | `npm run typecheck && npm run lint && npm test` |
| Build | CSS and icon tasks | `npm run lint && npx electron-vite build` |
| Manual | Smoke tasks T28–T31 | `node scripts/smoke-hours-calendar.mjs --seed`; `npm run dev -- -- "--user-data-dir=<dir>" --remote-debugging-port=9222 --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling`; `node scripts/smoke-hours-calendar.mjs` |

**Lint is judged by exit code AND by warning count** — diff it against the setup baseline at every gate.

**Smoke falsification rules** (every smoke task): each new check is first seen failing on a deliberately broken build, made by a script that keeps an `.orig` copy and restores it in `finally`, with `git status` checked clean afterwards. `npm run dev` does not restart the main process on `src/main` edits: a mutant under `src/main` needs the dev app relaunched. Sessions are ad-hoc `pwsh -NoLogo -NoProfile`, never a registry agent. The typed lookup is never driven (it would reach Azure DevOps); its UI is a line in the script's hand-verify header (L-030).

---

## Execution Plan

### Phase 1: Period data, pure

```
T1 → T2
```

### Phase 2: Tracker

```
T2 → T3 → T4 → T5
```

### Phase 3: Sessions, notifications, lookup, IPC

```
T5 → T6 → T7 → T8 → T9 → T10
```

### Phase 4: Renderer pure seams

```
T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 5: Renderer plumbing and the picker

```
T15 → T16 → T17 → T18 → T19
```

### Phase 6: Surfaces

```
T19 → T20 → T21 → T22 → T23 → T24 → T25 → T26
```

### Phase 7: Record and prove

```
T26 → T27 → T28 → T29 → T30 → T31
```

---

## Task Breakdown

### T1: Log lines accept the hand flag

**What**: `PeriodSnapshotFields.taskByHand?: boolean`; `isPeriodLine` accepts it absent or boolean and rejects any other type; `VERSION` stays 1.
**Where**: `src/main/time-log-store.ts` (type in `src/shared/time.ts`)
**Depends on**: None
**Reuses**: `isPeriodLine` (`time-log-store.ts:20-29`), the existing real-temp-dir store tests
**Requirement**: HTSK-41, HTSK-42, HTSK-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a line with `taskByHand: true` round-trips through `append` and `readPeriods`; a line without the key reads with no `taskByHand` key (`'taskByHand' in period` is false); a line with `taskByHand: "yes"` is skipped and counted; an appended period without the flag is written as `{"v":1,...}` with no `taskByHand` key
- [x] Gate check passes: `npx vitest run src/main/time-log-store.test.ts` then `npm test`
- [x] Test count: baseline + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): accept a hand-set task flag on log lines`

---

### T2: The flag rule, pure

**What**: `SessionTask` and `PeriodTaskChoice` types; `branchTaskId`, `withSessionTask` and `reassignFields` as in design.md. "No flag" is the absent key.
**Where**: `src/main/period-task.ts` (types in `src/shared/tasks.ts` and `src/shared/time.ts`)
**Depends on**: T1
**Reuses**: `taskIdFromBranch`
**Requirement**: HTSK-06, HTSK-10, HTSK-11, HTSK-25, HTSK-26, HTSK-27, HTSK-36, HTSK-37

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests, `withSessionTask`: no link returns the snapshot unchanged; a link to #12345 on `feature/67890-x` gives id 12345, the link's title and `taskByHand: true`; a link with a null title takes the pinned title; a link equal to the branch's id returns the snapshot unchanged with no flag key; a link on a null branch is flagged
- [x] Tests, `reassignFields`: a task differing from the branch is flagged; the branch's own task has no flag key; `none` on `feature/67890-x` is flagged and on `develop` is not; `branch` gives the branch's id and pinned title with no flag key; `branch` on a null branch gives null / null
- [x] Gate check passes: `npx vitest run src/main/period-task.test.ts` then `npm test`
- [x] Test count: T1 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): decide a hand-set task and its flag`

---

### T3: The tracker applies and changes a session's link

**What**: `started` stores `meta.task ?? null` on the run; `#open` applies it through `withSessionTask`; new dep `pinnedTitle`; new `taskChanged(sessionId, task)` per design.md.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T2
**Reuses**: `#open`, `#close`, `#changed` (`time-tracker.ts:189-232`)
**Requirement**: HTSK-09, HTSK-10, HTSK-11, HTSK-12, HTSK-13, HTSK-14, HTSK-15, HTSK-16

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a session started with a task opens a period recording it; one started without a task records the branch snapshot unchanged; `taskChanged` on a running session appends the previous period ending at T and opens a new one starting at T with the new task; the same link changes nothing (no append, no new open id, no emit); `null` opens the next period with the branch's task; while paused and while suspended it opens nothing and the resume opens with the new task; for a session with no run it changes nothing; a change 0.5 s after the open appends nothing and opens the new period (TIME-11); a link to #12345 in a worktree naming #67890 records 12345 with the flag; the sidecar written after the change holds the new open period (L-036)
- [x] The existing `setup()` harness gains the `pinnedTitle` dep; no existing test is edited otherwise
- [x] Gate check passes: `npx vitest run src/main/time-tracker.test.ts` then `npm test`
- [x] Test count: T2 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): count a linked session's time to its task`

---

### T4: Reassign a closed period

**What**: `reassignPeriod(id, choice)`: `#editTarget`, map through `reassignFields`, `#rewritten()`.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T3
**Reuses**: `adjustPeriod`'s shape (`time-tracker.ts:159-178`)
**Requirement**: HTSK-25, HTSK-26, HTSK-27, HTSK-32, HTSK-35, HTSK-36, HTSK-37, HTSK-39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a task choice rewrites the log with that id and title and leaves `branch`, `cwd`, `start`, `end`, `sessionId`, `agent`, `workspacePath` and `repoName` equal to before; `none` records null / null; `branch` restores the branch's id and pinned title and removes the flag key; the open period and a deleted id are rejected with the TIME-47 / TIME-49 texts and nothing is rewritten; one emit per success
- [x] Gate check passes: `npx vitest run src/main/time-tracker.test.ts` then `npm test`
- [x] Test count: T3 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): move a closed period to another task`

---

### T5: Split a closed period

**What**: `splitPeriod(id, at)` per design.md: the three rejection texts, the two parts in place, the second part with a new id right after the first.
**Where**: `src/main/time-tracker.ts`
**Depends on**: T4
**Reuses**: `#editTarget`, `MIN_PERIOD_MS`, `deps.newId`
**Requirement**: HTSK-28, HTSK-29, HTSK-30, HTSK-31, HTSK-32, HTSK-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: 09:00–12:00 split at 10:00 rewrites the log as `[09:00, 10:00]` with the original id and `[10:00, 12:00]` with a new id, next to each other, both carrying the task, flag and every other field; splits at start + 1 s and at end − 1 s succeed (L-042); at the start, at the end and outside give `Split time must be inside the period.`; a 1.5 s period split in its middle gives `Each part must last at least 1 second.`; `not-a-date` gives `Split time must be a valid date.`; each rejection leaves the log unrewritten; open and deleted ids are rejected; a period crossing local midnight splits at its exact instants
- [x] Gate check passes: `npx vitest run src/main/time-tracker.test.ts` then `npm test`
- [x] Test count: T4 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(time): split a closed period at a time inside it`

---

### T6: Sessions carry and persist their link

**What**: `PersistedSession.task?`; `spawn(..., task?)`; `duplicate` copies the link; `setTask(id, task)`; `SessionLifecycle.taskChanged`.
**Where**: `src/main/session-manager.ts` (type in `src/shared/config.ts`)
**Depends on**: T5
**Reuses**: `rename`'s pattern (`session-manager.ts:149-159`), `#persistUpsert`, the lifecycle observer tests (`session-manager.test.ts:490-577`)
**Requirement**: HTSK-09, HTSK-12, HTSK-13, HTSK-16, HTSK-17, HTSK-22

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `spawn` with a task persists it in `config.sessions` and hands it to `lifecycle.started`; `setTask` persists the link, returns a view carrying it and calls `taskChanged(id, task)`; `setTask(id, null)` removes the `task` key; `setTask` on a stopped session persists without starting anything; an unknown id throws `Unknown session: {id}`; a new `SessionManager` over the same config directory lists the session with its link, and `respawn` hands the link to `lifecycle.started`; `duplicate` of a linked session persists the copy with the same link
- [x] The lifecycle fake at `session-manager.test.ts:506` gains `taskChanged`
- [x] Gate check passes: `npx vitest run src/main/session-manager.test.ts` then `npm test`
- [x] Test count: T5 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(sessions): save a task link with the session`

**Note**: if the owner answers "duplicate does not keep the link", drop the `duplicate` change and its test.

---

### T7: Notifications name the linked task

**What**: `ActivityChange.task`, filled by `#setActivity` from the live meta; `SessionNotifier.handle` uses it and skips the branch lookup when set.
**Where**: `src/main/session-notifier.ts` (field in `src/main/activity-notification.ts`, filled in `src/main/session-manager.ts:414-427`)
**Depends on**: T6
**Reuses**: `describeNotification`'s task line (`activity-notification.ts:73-88`)
**Requirement**: HTSK-21

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a notifying change with `task: { id: 4821, title: 'Diagnose login loop' }` titles the notification `#4821 · Diagnose login loop` and never calls `linkedTask`; with `task: null` it calls `linkedTask(cwd)` as before; after `setTask` on a running session, the next activity transition reaches `onActivityChange` with that task
- [x] New tests are appended as new `describe` blocks (PR #98 inserts tests mid-file in `activity-notification.test.ts`)
- [x] Gate check passes: `npx vitest run src/main/session-notifier.test.ts src/main/session-manager.test.ts` then `npm test`
- [x] Test count: T6 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(notifications): name a session's linked task`

---

### T8: Look up a work item without pinning it

**What**: `LookupTaskResult`; `TaskBoard.lookup(input)` per design.md.
**Where**: `src/main/task-board.ts` (type in `src/shared/tasks.ts`)
**Depends on**: T7
**Reuses**: `parseTaskInput`, `pin`'s fetch and error texts (`task-board.ts:139-163`), `stubSource`
**Requirement**: HTSK-02, HTSK-04, HTSK-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: a bare number with defaults returns `{ ok: true, item: { id, type, title } }` from the stub; a work item URL does the same; `config.pinnedTasks` and `list()` are unchanged afterwards; a pinned id is returned like any other; a failed fetch returns `Could not reach Azure DevOps — run az login and try again.` and `list().auth` is `failed`; a missing item returns `Work item #{id} not found in {org}/{project}.`; an empty input returns `Paste a work item ID or ADO URL.` (`list()` differs only in `auth`, which the lookup updates as `pin` does per design.md)
- [x] Gate check passes: `npx vitest run src/main/task-board.test.ts` then `npm test`
- [x] Test count: T7 count + the new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): look up a work item without pinning it`

---

### T9: IPC channels

**What**: `sessions:spawn` gains `task?`; new `sessions:set-task`, `tasks:lookup`, `time:reassign`, `time:split`, each with a one-line doc comment naming its HTSK ids.
**Where**: `src/shared/ipc-contract.ts`
**Depends on**: T8
**Reuses**: the `time:adjust` entry (`ipc-contract.ts:144-145`)
**Requirement**: HTSK-02, HTSK-09, HTSK-12, HTSK-25, HTSK-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(ipc): add channels to link, reassign, split and look up`

---

### T10: Wire main

**What**: a local `pinnedTitle(id)` replaces the inline map in `resolveSnapshot` and feeds the tracker's new dep; handlers for the four channels; `sessions:spawn` forwards `task`.
**Where**: `src/main/index.ts`
**Depends on**: T9
**Reuses**: `index.ts:445-470` (tracker), `:566-580` (session handlers), `:373-377` (task handlers)
**Requirement**: HTSK-02, HTSK-09, HTSK-12, HTSK-25, HTSK-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`. The first clause of **What** (the local pinned-title helper) was already done in T3: `pinnedTitles()` feeds both `resolveSnapshot` and the tracker's `pinnedTitle` dep; T10 adds the four handlers and forwards `task` on `sessions:spawn`

**Tests**: none
**Gate**: full

**Commit**: `feat(time): wire task links, reassign and split into main`

---

### T11: A session's task: link first, then branch

**What**: `deriveAttribution(tree, cwd, link?)` returns `{ branch, taskId, detached, linked, linkTitle }`, the link's id winning.
**Where**: `src/renderer/src/lib/session-attribution.ts`
**Depends on**: T10
**Reuses**: the existing worktree match (`session-attribution.ts:16-24`)
**Requirement**: HTSK-11, HTSK-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (new file `session-attribution.test.ts`): without a link, a worktree on `feature/12345-x` gives 12345 and `linked: false`; a detached cwd gives `detached: true`, task null; a link to #4821 on `develop` gives 4821, `linked: true` and the link's title; a link on a detached cwd gives 4821 and still `detached: true`; a link on `feature/67890-x` gives 4821 and keeps the branch `feature/67890-x`
- [x] Existing callers compile unchanged
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/session-attribution.test.ts` then `npm test`
- [x] Test count: T10 count + the new tests: 1761 + 7 = 1768 (93 files)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agents): derive a session's task from its link before its branch`

---

### T12: The rail groups by the linked task

**What**: `buildRailGroups` passes `session.task`; a linked session joins `task:{id}`; `TaskGroup.title` from the first linked session's `linkTitle`; orphan rules only when the effective task is null.
**Where**: `src/renderer/src/lib/rail-groups.ts`
**Depends on**: T11
**Reuses**: `buildRailGroups` (`rail-groups.ts:167-201`)
**Requirement**: HTSK-11, HTSK-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests (appended `describe`): a detached session linked to #4821 is a task group `task:4821`, not an orphan; a session on `feature/67890-x` linked to #12345 is in `task:12345`; an unlinked session on the same task and a linked one share one group, in persisted order; an unpinned link's group carries its title and a null-title link's group carries `title: null`; unlinked sessions produce the same groups as before
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/rail-groups.test.ts` then `npm test`
- [x] Test count: T11 count + the new tests: 1768 + 7 = 1775 (93 files). The group's aria-label names the link title too when details are null, like the header (HTSK-20)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agents): group a linked session under its task`

---

### T13: Picker entries, pure

**What**: `pickerEntries(tasks, { fromBranch, noTask })` and `lookupEntry(item)` per design.md.
**Where**: `src/renderer/src/lib/task-picker.ts`
**Depends on**: T12
**Reuses**: `badgeTypeOf`
**Requirement**: HTSK-01, HTSK-02, HTSK-18, HTSK-24

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: the session set is `From branch` then the pins, with no `No task`; the drawer set is `No task`, `From branch`, then the pins; a pin with details reads `#9201` plus its title and badge type, one without reads `#9201` with no title; a repeated id keeps the first pin only; `lookupEntry({ id: 4821, type: 'User Story', title: 'Diagnose login loop' })` reads `User Story #4821 Diagnose login loop` and chooses `{ kind: 'task', id: 4821, title: 'Diagnose login loop' }`; `From branch` chooses `{ kind: 'branch' }`, `No task` chooses `{ kind: 'none' }`
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/task-picker.test.ts` then `npm test`
- [x] Test count: T12 count + the new tests: 1775 + 8 = 1783 (94 files). A pin entry is { key, label: '#id', badgeType, title, choice } (title added to design's shape: the pill sits between id and title, HTSK-01); lookupEntry returns { key, text, choice }

**Tests**: unit
**Gate**: quick

**Commit**: `feat(tasks): list the picker's choices`

**Note**: if the owner wants `No task` for sessions too, flip the session set here and in T21.

---

### T14: Drawer edit helpers, pure

**What**: `handMarkTitle(branch)`, `splitDefault(startIso, endIso)`; `toLocalInput` / `fromLocalInput` move here from `PeriodRow.tsx`, which imports them.
**Where**: `src/renderer/src/lib/period-edit.ts` (import change in `src/renderer/src/components/PeriodRow.tsx`)
**Depends on**: T13
**Reuses**: `PeriodRow.tsx:15-33`
**Requirement**: HTSK-33, HTSK-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: `handMarkTitle('develop')` is `Assigned by hand (branch: develop)`; `handMarkTitle(null)` is `Assigned by hand (no branch)`; `splitDefault` of 09:00:00–12:00:00 is `…T10:30:00`; of 09:00:00–09:00:03 is `…T09:00:01` (1.5 s floored, not rounded up, L-043); of 09:00:00–09:00:05 is `…T09:00:02`; `fromLocalInput(toLocalInput(iso))` returns `iso` for a whole-second instant
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/period-edit.test.ts` then `npm test`
- [x] Test count: T13 count + the new tests: 1783 + 9 = 1792 (95 files); also passes under TZ=UTC, Asia/Kolkata, America/Sao_Paulo, Pacific/Chatham

**Tests**: unit
**Gate**: quick

**Commit**: `feat(hours): add the hand mark text and the split default`

---

### T15: Reports group by the recorded task

**What**: A regression test pinning HTSK-40: a period whose `taskId` differs from its branch's groups under its `taskId`, and a hand-set unpinned task is labelled with its stored title.
**Where**: `src/renderer/src/lib/hours-report.test.ts`
**Depends on**: T14
**Reuses**: the existing report fixtures
**Requirement**: HTSK-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Tests: two periods on `develop`, one with `taskId: 4821, taskByHand: true`, one without a task, give groups `task:4821` labelled `Task #4821 Diagnose login loop` and `cwd:…`; a period on `feature/67890-x` recording 12345 is in `task:12345`, not `task:67890`
- [x] The test is seen failing against a `groupKey` mutated to read the branch's id, then passing: seen with a scripted mutant (groupKey takes the id from the branch's last digits, .orig restored): 2 of the 16 report tests fail, 14 pass
- [x] Gate check passes: `npx vitest run src/renderer/src/lib/hours-report.test.ts` then `npm test`
- [x] Test count: T14 count + the new tests: 1792 + 2 = 1794 (95 files)

**Tests**: unit
**Gate**: quick

**Commit**: `test(hours): group periods by their recorded task`

---

### T16: `useTime` reassigns and splits

**What**: `reassignPeriod(id, choice)` and `splitPeriod(id, at)`, refetching after either, like `adjustPeriod`.
**Where**: `src/renderer/src/lib/use-time.ts`
**Depends on**: T15
**Reuses**: `adjustPeriod` (`use-time.ts:46-50`)
**Requirement**: HTSK-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): expose reassign and split to the renderer`

---

### T17: `useSessions` spawns with a task and changes it

**What**: `spawnSession(agentName, cwd, adhocCommand?, task?)`; `setSessionTask(id, task)` refetching like `renameSession`, with a failure toast `Couldn't change the session's task`.
**Where**: `src/renderer/src/lib/use-sessions.ts`
**Depends on**: T16
**Reuses**: `spawnSession`, `renameSession` (`use-sessions.ts:68-87`)
**Requirement**: HTSK-09, HTSK-12

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(sessions): spawn with a task and change it from the renderer`

---

### T18: The task picker

**What**: `TaskPicker` popover: the entries from `pickerEntries`, a field (`Type a work item number or paste its URL`) with a `Look up` button and Enter, the lookup row from `lookupEntry`, the error line; `tasks:lookup` only on submit; Escape and an outside click close it; it reports a `PeriodTaskChoice`.
**Where**: `src/renderer/src/components/TaskPicker.tsx`
**Depends on**: T17
**Reuses**: T13; the task pills
**Requirement**: HTSK-01, HTSK-02, HTSK-03, HTSK-04, HTSK-05, HTSK-06

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`. The stylesheet import lands with its file in T19, so this commit still builds

**Tests**: none
**Gate**: full

**Commit**: `feat(tasks): add the task picker`

---

### T19: Picker styles

**What**: The popover, entry rows, the lookup row and the error line in both themes, from the existing tokens.
**Where**: `src/renderer/src/components/TaskPicker.css`
**Depends on**: T18
**Reuses**: the context-menu and dialog tokens
**Requirement**: HTSK-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint && npx electron-vite build`. Batch-end Full gate also run: typecheck clean, lint 0 errors / 18 warnings, 1794 tests / 95 files, electron-vite build OK

**Tests**: none
**Gate**: build

**Commit**: `style(tasks): style the task picker`

---

### T20: Three icons

**What**: `tag`, `scissors`, `hand`, appended at the end of `IconName` and `PATHS` (PR #98 edits a comment higher up).
**Where**: `src/renderer/src/components/Icon.tsx`
**Depends on**: T19
**Reuses**: the existing 24-unit stroke glyphs
**Requirement**: HTSK-23, HTSK-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run lint && npx electron-vite build` (lint 0 errors / 18 warnings)

**Tests**: none
**Gate**: build

**Commit**: `feat(ui): add tag, scissors and hand icons`

---

### T21: The new-session dialog chooses a task

**What**: `tasks` prop; a Task row (`From branch`, or `#{id} {title}`) with `Change` opening the picker (session set); starts on `source.taskId` with the pin's title; `onSpawn` carries the task; App passes `tasks.tasks` and forwards the task to `spawnSession`.
**Where**: `src/renderer/src/components/NewSessionDialog.tsx` (call site in `src/renderer/src/App.tsx:560-570`)
**Depends on**: T20
**Reuses**: T18; the dialog chassis
**Requirement**: HTSK-07, HTSK-08, HTSK-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(sessions): choose a task in the new-session dialog`

---

### T22: The detail strip shows and changes the task

**What**: The strip's task becomes a button showing the effective task (`#{id}` + pills + title, or `No task`), also for a detached session, with the tooltip `Task from the branch · click to change` or `Task set by hand · click to change`; it opens the picker (session set); `From branch` sends `null`. `onSetTask` is added last in `SessionDetail`'s and `AgentsView`'s props; App passes `setSessionTask`.
**Where**: `src/renderer/src/components/AgentsView.tsx` (styles in `AgentsView.css`, wiring in `src/renderer/src/App.tsx:455-473`)
**Depends on**: T21
**Reuses**: T11's `deriveAttribution(tree, cwd, session.task)`; the strip (`AgentsView.tsx:274-296`)
**Requirement**: HTSK-11, HTSK-13, HTSK-18

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The detail header (clock, pill, action buttons) is untouched, so PR #98's hunks stay clean
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(agents): show and change a session's task from its detail strip`

---

### T23: The rail row menu and the linked header

**What**: `onContextMenu` on a rail row opens a menu at the pointer with `Change task…`; it opens the picker (session set) for that row's session; the menu closes on any click or Escape; the task header shows `group.details.title`, else `group.title`, else `group.branch`. AgentsView passes `onSetTask` to the rail.
**Where**: `src/renderer/src/components/SessionRail.tsx` (styles in `SessionRail.css`)
**Depends on**: T22
**Reuses**: `CommitList`'s menu (`CommitList.tsx:45-65, 121-150`)
**Requirement**: HTSK-19, HTSK-20

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Nothing new renders inside a row (RAIL-12)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(agents): change a session's task from its rail row`

**Note**: if the owner prefers a visible control, this task changes to that control and T30's menu checks change with it.

---

### T24: The hand mark on a period row

**What**: A `hand` icon on a row whose period has `taskByHand`, with `handMarkTitle(period.branch)` as its `title` and `aria-label`.
**Where**: `src/renderer/src/components/PeriodRow.tsx` (style in `PeriodRow.css`)
**Depends on**: T23
**Reuses**: T14, T20
**Requirement**: HTSK-38

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): mark a period whose task was set by hand`

---

### T25: Split a period from the drawer

**What**: A `Split at` icon button (scissors) on closed rows; a `split` mode with one `datetime-local` field (step 1) pre-filled by `splitDefault`, `Split` and `Cancel`, main's verdict through `settle`; `onSplit` threaded `App` → `HoursView` → `DayCard` → `GroupSection` → `BlockLine` → `PeriodRow`.
**Where**: `src/renderer/src/components/PeriodRow.tsx` (threading in `HoursView.tsx` and `App.tsx:489-494`)
**Depends on**: T24
**Reuses**: the `edit` mode's form (`PeriodRow.tsx:130-157`), T14, T16
**Requirement**: HTSK-23, HTSK-28, HTSK-29, HTSK-30, HTSK-31, HTSK-33, HTSK-34, HTSK-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Running rows keep showing only `running` (TIME-47)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): split a period from the day detail`

---

### T26: Change a period's task from the drawer

**What**: A `Change task` icon button (tag) on closed rows opening the picker (drawer set); the choice goes to `onReassign`; `tasks` and `onReassign` threaded like T25.
**Where**: `src/renderer/src/components/PeriodRow.tsx` (threading in `HoursView.tsx` and `App.tsx:489-494`)
**Depends on**: T25
**Reuses**: T18, T16
**Requirement**: HTSK-23, HTSK-24, HTSK-25, HTSK-26, HTSK-27, HTSK-34, HTSK-35

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Gate check passes: `npm run typecheck && npm run lint && npm test`. Batch-end gate also run: typecheck clean, lint 0 errors / 18 warnings, 1794 tests / 95 files, electron-vite build OK

**Tests**: none
**Gate**: full

**Commit**: `feat(hours): change a period's task from the day detail`

---

### T27: Record the decision and amend the sibling specs

**What**: The AD from design.md's "AD-TBD" (now AD-048) with the next free number (checked across `develop`, `origin/main` and every planned branch's `STATE.md`); in `time-tracking/spec.md`, the Out of Scope row and TIME-03 annotated as superseded / amended by it; in `agents-rail-v2/spec.md`, RAIL-08 annotated.
**Where**: `.specs/STATE.md` (annotations in `.specs/features/time-tracking/spec.md` and `.specs/features/agents-rail-v2/spec.md`)
**Depends on**: T26
**Reuses**: AD-018 / AD-029's supersession wording
**Requirement**: HTSK-10, HTSK-20, HTSK-25

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] The AD number is checked free and named in the commit body (AD-048)

**Tests**: none
**Gate**: quick

**Commit**: `docs(state): record hand-set tasks for sessions and periods`

---

### T28: Smoke seed: a repo, two pins, a `develop` period

**What**: `--seed` also writes, under the seed directory: a git repo `ws/acme-widgets` (`git init -b develop`, one empty commit with a fictitious author) with a worktree `wt/acme-widgets-9202` on `feature/9202-seed`; `config.json` registering `ws` as a workspace and pinning `acme/platform` #9201 and #9202; one closed period `hours-smoke-develop`, Wednesday two weeks back, 09:00–12:00 local, in the repo on `develop`, task null. The seed guard also requires `hours-smoke-develop`. The header documents sections 13–15 and a hand-verify block: the typed lookup (result row, error text, nothing pinned), the notification task line, the link surviving an app restart, the mark's look in both themes.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T27
**Reuses**: the seed block (`smoke-hours-calendar.mjs:200-253`)
**Requirement**: HTSK-08, HTSK-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Setup step done in this worktree (see top)
- [x] The existing 52 checks still pass on the new seed (52/52)
- [x] A seed missing the `develop` period is refused with `not running on the seeded data`
- [x] Gate check passes: `npm run lint` (warning count unchanged: 0 errors / 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): seed a repo, two pins and a develop period`

---

### T29: Smoke section 13 — split, reassign, mark, From branch

**What**: On the seeded `develop` day (◀ twice):
- 13.1 precondition: one group `No task · acme-widgets`, one block `09:00–12:00`, `1 period`, no mark;
- 13.2 `Split at` shows the field at `…T10:30:00`;
- 13.3 splitting at the period's start shows `Split time must be inside the period.` and the block still reads `1 period`;
- 13.4 splitting at 10:00:00 gives `2 periods`, rows `09:00:00–10:00:00` and `10:00:00–12:00:00`, and the snapshot holds the seed id plus one new id, both on `develop`;
- 13.5 the first part to `#9201` gives groups `Task #9201` `1h00` and `No task · acme-widgets` `2h00`, and a legend chip `Task #9201`;
- 13.6 that row shows the mark with the tooltip `Assigned by hand (branch: develop)`, and the No-task row shows none;
- 13.7 the second part to `#9202` leaves groups `Task #9201` and `Task #9202`, no No-task group or chip, both rows marked;
- 13.8 `From branch` on the first part moves it back to `No task · acme-widgets` with no mark, its snapshot period has no `taskByHand` key and its branch is still `develop`;
- 13.9 in the current week, with at least one running and one closed row expanded, the running row has neither `Change task` nor `Split at` and the closed row has both.

**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T28
**Reuses**: section 12's drawer probes
**Requirement**: HTSK-23, HTSK-25, HTSK-26, HTSK-27, HTSK-28, HTSK-29, HTSK-33, HTSK-34, HTSK-35, HTSK-36, HTSK-37, HTSK-38, HTSK-39, HTSK-40

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its mutant, then passing: `splitDefault` returning the start (13.2); the inside check removed from `splitPeriod`, relaunched (13.3, shows the 1 s text instead); `splitPeriod` answering ok without rewriting, relaunched (13.4); `reassignPeriod` ignoring the choice, relaunched (13.5, 13.7); the mark not rendered and, separately, its tooltip reading `Set by hand` (13.6); `branch` keeping the flag in `reassignFields`, relaunched (13.8); the buttons rendered on running rows (13.9)
- [x] Gate check passes: `npm run lint` (warning count unchanged: 0 errors / 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(hours): check splitting and reassigning a period`

---

### T30: Smoke section 14 — link a session from its rail row and strip

**What**: With the ad-hoc session in `C:\Windows`:
- 14.1 precondition: it sits in an orphan group noted `detached · Windows` and its open period has task null;
- 14.2 right-clicking its row shows `Change task…`, which opens a picker listing `From branch`, `#9201`, `#9202` and no `No task`;
- 14.3 choosing `#9201` puts its row in a group headed `#9201` and in no orphan group;
- 14.4 its open period records 9201 with `taskByHand: true`, and its previous period ends at the new period's start;
- 14.5 `config:get` holds the session with `task.id` 9201;
- 14.6 after waiting 1.5 s, choosing `#9201` again leaves its closed-period count unchanged;
- 14.7 its detail strip shows `#9201`; the strip's picker `From branch` moves it back to the orphan group, its open period records task null and its config entry has no `task` key.

**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T29
**Reuses**: `smoke-rail-v2.mjs`'s rail probes
**Requirement**: HTSK-11, HTSK-12, HTSK-13, HTSK-14, HTSK-17, HTSK-18, HTSK-19

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its mutant, then passing: the menu without its item (14.2); the picker offering `No task` to sessions (14.2); `buildRailGroups` ignoring `session.task` (14.3); `taskChanged` storing the link without closing and opening, relaunched (14.4); `setTask` not persisting, relaunched (14.5); the same-link guard removed, relaunched (14.6); the strip sending the current link instead of `null` (14.7)
- [x] Gate check passes: `npm run lint` (warning count unchanged: 0 errors / 18 warnings); 14.4 first failed on a real defect (1 ms gap between the closed and the new period), fixed in `TimeTracker.taskChanged` with a unit test

**Tests**: manual
**Gate**: manual

**Commit**: `test(agents): check linking a session to a task`

---

### T31: Smoke section 15 — the new-session dialog, and the final gate

**What**:
- 15.1 the Agents `New` button opens the dialog with Task `From branch`;
- 15.2 in the Tree direction, pinned #9202's Agent button (its worktree exists) opens the dialog with Task `#9202`;
- 15.3 choosing Ad-hoc `pwsh -NoLogo -NoProfile`, Task `#9201`, and Spawn starts a session in `wt/acme-widgets-9202` whose open period records 9201 with the flag and branch `feature/9202-seed`, and whose row is under `#9201`, not `#9202`;
- 15.4 its strip's `From branch` makes its open period record 9202 with no flag and moves its row under `#9202`.

The new sessions join the cleanup list. Then the full gate.
**Where**: `scripts/smoke-hours-calendar.mjs`
**Depends on**: T30
**Reuses**: T30's probes
**Requirement**: HTSK-07, HTSK-08, HTSK-09, HTSK-10, HTSK-11, HTSK-13, HTSK-36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Each check seen failing on its mutant, then passing: the dialog starting on the first pin (15.1); the dialog ignoring `source.taskId` (15.2); `onSpawn` dropping the task (15.3); `taskChanged` ignoring a `null` link, relaunched (15.4)
- [x] The whole smoke passes twice in a row on a fresh seed (73/73, twice)
- [x] Gate check passes: `npm run typecheck && npm run lint && npm test` and `npx electron-vite build` (1795 tests / 95 files; 0 errors / 18 warnings)

**Tests**: manual
**Gate**: manual

**Commit**: `test(sessions): check choosing a task in the new-session dialog`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1 ------→ T2
Phase 2:  T2 ------→ T3 ------→ T4 ------→ T5
Phase 3:  T5 ------→ T6 ------→ T7 ------→ T8 ------→ T9 ------→ T10
Phase 4:  T10 -----→ T11 -----→ T12 -----→ T13 -----→ T14 -----→ T15
Phase 5:  T15 -----→ T16 -----→ T17 -----→ T18 -----→ T19
Phase 6:  T19 -----→ T20 -----→ T21 -----→ T22 -----→ T23 -----→ T24 -----→ T25 -----→ T26
Phase 7:  T26 -----→ T27 -----→ T28 -----→ T29 -----→ T30 -----→ T31
```

Thirty-one tasks in seven phases: about five batches (Phases 1–2, 3, 4, 5–6, 7). At Execute the sub-agent offer is made first. Phases 1–4 are main and pure logic (unit-gated); Phase 6 and 7 need the dev app.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: log flag | 1 validator + 1 optional type field | ✅ Granular |
| T2: flag rule | 3 pure functions, 1 file + 2 types | ⚠️ Cohesive |
| T3–T5: tracker | 1 operation each | ✅ Granular |
| T6: session link | 1 module; its type in config.ts | ⚠️ Cohesive |
| T7: notifications | 1 field carried to 1 consumer, 3 files | ⚠️ Cohesive (one field end to end) |
| T8: lookup | 1 method + 1 type | ✅ Granular |
| T9: contract | 1 file | ✅ Granular |
| T10: wiring | 1 file | ✅ Granular |
| T11–T13: renderer seams | 1 module each | ✅ Granular |
| T14: drawer helpers | 1 module + an import move | ⚠️ Cohesive |
| T15: report test | 1 test file | ✅ Granular |
| T16, T17: hooks | 1 hook each | ✅ Granular |
| T18, T19: picker | 1 component, 1 stylesheet | ✅ Granular |
| T20: icons | 1 file | ✅ Granular |
| T21–T23: session surfaces | 1 component each, with its call site or stylesheet | ⚠️ Cohesive (typecheck stays green, L-001) |
| T24–T26: drawer surfaces | 1 control each, threaded through its hosts | ⚠️ Cohesive (typecheck stays green, L-001) |
| T27: decision | 1 AD + 2 annotations | ⚠️ Cohesive |
| T28–T31: smoke | 1 section each | ✅ Granular |

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
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T25 | T25 → T26 | ✅ Match |
| T27 | T26 | T26 → T27 | ✅ Match |
| T28 | T27 | T27 → T28 | ✅ Match |
| T29 | T28 | T28 → T29 | ✅ Match |
| T30 | T29 | T29 → T30 | ✅ Match |
| T31 | T30 | T30 → T31 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | main deep module (store) | unit | unit | ✅ OK |
| T2 | main pure helper | unit | unit | ✅ OK |
| T3–T5 | main deep module (tracker) | unit | unit | ✅ OK |
| T6 | main deep module (sessions) | unit | unit | ✅ OK |
| T7 | main deep modules (notifier, sessions) | unit | unit | ✅ OK |
| T8 | main deep module (task board) | unit | unit | ✅ OK |
| T9 | IPC contract | none | none | ✅ OK |
| T10 | `index.ts` wiring | none | none | ✅ OK |
| T11–T15 | renderer pure libs | unit | unit | ✅ OK |
| T16, T17 | renderer hooks | none | none | ✅ OK |
| T18–T26 | components, CSS, icons | none (smoke) | none | ✅ OK |
| T27 | docs | none | none | ✅ OK |
| T28–T31 | end to end | manual | manual | ✅ OK |

## Requirement → Evidence Map

Every AC and edge case has its own unit test or numbered smoke check (L-021, L-025):

| Requirement | Evidence |
| ----------- | -------- |
| HTSK-01 | T13 unit; T30 14.2 |
| HTSK-02, 04, 05 | T8 unit; T13 unit (row text); hand-verify header (UI) |
| HTSK-03 | T18 by construction; hand-verify header |
| HTSK-06 | T2, T13 unit |
| HTSK-07, 08 | T31 15.1, 15.2 |
| HTSK-09 | T3, T6 unit; T31 15.3 |
| HTSK-10 | T2, T3 unit; T31 15.4 |
| HTSK-11 | T2, T3, T11, T12 unit; T30 14.3; T31 15.3 |
| HTSK-12 | T3 unit; T30 14.4 |
| HTSK-13 | T3, T6 unit; T30 14.7; T31 15.4 |
| HTSK-14 | T3 unit; T30 14.6 |
| HTSK-15, 16 | T3, T6 unit |
| HTSK-17 | T6 unit (restart, respawn); T30 14.5; hand-verify header (real restart) |
| HTSK-18 | T11, T13 unit; T30 14.2, 14.7 |
| HTSK-19 | T30 14.2 |
| HTSK-20 | T12 unit |
| HTSK-21 | T7 unit; hand-verify header |
| HTSK-22 | T6 unit |
| HTSK-23, 34 | T29 13.9 |
| HTSK-24 | T13 unit |
| HTSK-25, 26, 27 | T2, T4 unit; T29 13.5, 13.8 |
| HTSK-28 | T5 unit; T29 13.4 |
| HTSK-29 | T5 unit; T29 13.3 |
| HTSK-30, 31, 32 | T4, T5 unit |
| HTSK-33 | T14 unit; T29 13.2 |
| HTSK-35 | T4, T5 unit (rewrite); T29 13.4, 13.5 (drawer refresh) |
| HTSK-36, 37 | T2, T3, T4 unit; T29 13.6, 13.8; T31 15.3, 15.4 |
| HTSK-38 | T14 unit; T29 13.6 |
| HTSK-39 | T4 unit; T29 13.8 |
| HTSK-40 | T15 unit; T29 13.5, 13.7 (legend, drawer) |
| HTSK-41, 42, 43 | T1 unit |
| Edge: link over another task's branch | T3, T12 unit; T31 15.3 |
| Edge: unpinned link keeps id and title | T12 unit (group title) |
| Edge: change under 1 s | T3 unit |
| Edge: split across midnight | T5 unit |
| Edge: lookup of a pinned id | T8 unit |
| Edge: split at start + 1 s / end − 1 s | T5 unit |
| Edge: Other colour after an edit | HCAL-24 unchanged, so no new check; one is added only if the owner asks for a repaint instead (owner confirmed 2026-09-26) |
