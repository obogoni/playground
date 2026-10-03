# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-001 - When a design types a cross-phase dependency as required, wire the producer and consumer in one phase (or gate the field) rather than relaxing it to optional to keep an interim phase's typecheck green
- signal: `spec_deviation` · recurrence: 2 feature(s) · scope: `workflow-ctx` · harmful: 0
- features: workflows-agent-step, workflows-blocker-resume
- evidence: src/main/workflow-ctx.ts:82,106 (CtxDeps.agent / CtxRuntime.signal SPEC_DEVIATION) (workflow-ctx) (+1 more)
- last seen: 2026-07-06T16:15:40Z

### L-005 - Before adding real-process or real-git tests, check whether existing suites already sit near the default per-test timeout: the extra parallel load alone can push them over it, turning a green gate red without any production change
- signal: `gate_fail` · recurrence: 2 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook, worktree-removal-fault-tolerance
- evidence: validation.md round-2 gate section; tree.test.ts / worktree-manager.test.ts timeouts (testing) (+1 more)
- last seen: 2026-07-31T12:27:40Z

### L-009 - A default-constant test that asserts resolvePaneWidth(undefined, bounds, DEFAULT) against DEFAULT itself cannot detect a change to that constant — pin every spec-derived default with a literal assertion, not a self-referential one.
- signal: `surviving_mutant` · recurrence: 2 feature(s) · scope: `renderer/lib` · harmful: 0
- features: sidebar-resize-collapse, agent-task-link
- evidence: src/renderer/src/lib/pane-layout.test.ts:41 (renderer/lib) (+1 more)
- last seen: 2026-09-28T22:09:36Z

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-008 - When a hard-coded value becomes a lookup table keyed by an existing enum, test the wiring from key to entry, not just the table: asserting the table's contents leaves the new key free to silently resolve to the old entry, and a guard that returns before any side effect (a missing-path check) usually makes that routing assertable without touching the real subsystem.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: vs2026-admin-shortcut
- evidence: M4/M5: launch() -> VS_EDITIONS[tool]; openVisualStudio(edition) (src/main/**)
- last seen: 2026-08-28T19:48:01Z

### L-010 - When a spec edge case says 'empty/whitespace', guard with trim().length > 0, not length > 0, or whitespace-only selections slip past the empty check.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `src/renderer/src/components` · harmful: 0
- features: terminal-input-fixes
- evidence: src/renderer/src/components/TerminalPane.tsx:95 (src/renderer/src/components)
- last seen: 2026-09-01T00:11:37Z

### L-011 - When an AC names a literal byte or string the app must emit, export that literal as a const from the tested lib seam and assert it (plus assert it is NOT the wrong value) - a literal inlined in an untested component leaves a NOT-SHALL-send AC unguarded and a byte flip passes the whole suite.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/renderer/src/lib,src/renderer/src/components` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: M11 TerminalPane.tsx:134 (src/renderer/src/lib,src/renderer/src/components)
- last seen: 2026-09-09T21:51:27Z

### L-012 - Under a no-component-tests convention, push every AC-bearing decision (timestamp restart, trim threshold, preventDefault ordering) into the pure lib function and leave only DOM/clipboard calls in the component - state left in the component is verifiable by reading only and regresses silently.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/renderer/src/components` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: M12-M16 TerminalPane.tsx:104,123,199,203,206 (src/renderer/src/components)
- last seen: 2026-09-09T21:51:28Z

### L-013 - An AC that starts a timer 'WHEN the app copies X' must state explicitly whether an attempted copy of nothing also starts it - the implementation set the timestamp before the empty-selection guard, a behavior no AC covers and no test can flag.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `.specs/features` · harmful: 0
- features: terminal-copy-undo-fixes
- evidence: TCU-05 vs TCU-19 (.specs/features)
- last seen: 2026-09-09T21:51:28Z

### L-014 - Freeze a design region by naming the components that are unchanged, never by a CSS or source line range, because a line range silently over-freezes neighbouring rules the handoff re-specified.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `design` · harmful: 0
- features: agents-rail-v2
- evidence: .specs/features/agents-rail-v2/design.md:220 (corrected by commit 7568fa6) (design)
- last seen: 2026-09-13T16:04:58Z

### L-015 - When one acceptance criterion refers to a label another criterion already pins, cite that criterion instead of paraphrasing it, because a paraphrase drifts and the two criteria then disagree.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: agents-rail-v2
- evidence: spec.md RAIL-19 vs RAIL-09 (validation.md SP-1) (spec)
- last seen: 2026-09-13T16:04:59Z

### L-016 - Do not type a clickable row that contains its own action buttons as a <button>; use a div with role="option" plus tabIndex and key handling, because a button nested in a button is invalid HTML.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: agents-rail-v2
- evidence: src/renderer/src/components/SessionRail.tsx:264 SPEC_DEVIATION (renderer)
- last seen: 2026-09-13T16:05:00Z

### L-017 - Assert a reset-to-zero effect from a state that actually holds a non-zero value: a test that drives the event from an already-zero state passes whether or not the reset happens
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: session-activity-status
- evidence: activity-machine.ts:77,:108 (testing)
- last seen: 2026-09-16T00:25:09Z

### L-018 - When an AC lands in a layer the project exempts from unit tests, extract the decision into a lib module and test that, rather than deferring the evidence to a smoke script that has not been written yet
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: session-activity-status
- evidence: ACTV-07, ACTV-27 (renderer)
- last seen: 2026-09-16T00:25:09Z

### L-019 - Pin a spec-mandated numeric limit with a literal assertion on the default production uses; a test that overrides the value to run fast leaves the default free to drift.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: status-bar
- evidence: M17 src/main/git-sync.ts:7 OP_TIMEOUT_MS (STBR-24) (src/main/**)
- last seen: 2026-09-19T16:44:45Z

### L-020 - When an AC mandates an environment variable or spawn option for a child process, assert it from inside the spawned process or on the spawn call; testing the wrapper's outcomes never observes it.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: status-bar
- evidence: M18 src/main/git.ts:22 GIT_TERMINAL_PROMPT (STBR-27) (src/main/**)
- last seen: 2026-09-19T16:44:45Z

### L-021 - When a task names a smoke script as the sole evidence for an AC, confirm the script has a numbered check asserting that AC before marking it done; listing the requirement ID is not a check.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: status-bar
- evidence: STBR-23 / M19 src/renderer/src/components/SyncPopover.tsx:94; tasks.md T18 claims sole evidence (scripts/smoke)
- last seen: 2026-09-19T16:44:45Z

### L-022 - Before an edge case cites a state the app already derives, confirm the model carries it at that level; otherwise name the state the feature must add.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: status-bar
- evidence: spec.md Edge Cases: path-missing state the tree already derives (only WorkspaceNode.missing exists) (spec)
- last seen: 2026-09-19T16:44:45Z

### L-023 - Git pull and push write progress and hint lines to stderr before the error, so report the first fatal or error line rather than the first stderr line.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: status-bar
- evidence: src/main/git-sync.ts:69-80 errorLine vs gitFailureLine (src/main/**)
- last seen: 2026-09-19T16:44:46Z

### L-024 - When an error extractor accepts several prefixes, drive a real failure for each prefix; testing only one leaves the others, and flags that turn the refusal into success, free to change unseen.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `main/git` · harmful: 0
- features: status-bar
- evidence: validation.md M29, M30 (src/main/git-sync.ts:81, :35) (main/git)
- last seen: 2026-09-19T17:53:18Z

### L-025 - Map every spec edge case to its own test or numbered smoke check in tasks.md, as ACs are; edge cases left to structure or to the tool's own behaviour reach validation with no evidence.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `specs/edge-cases` · harmful: 0
- features: status-bar
- evidence: validation.md edge cases: dirty pull, Escape, one popover at a time, no toast; STBR-25 refresh (specs/edge-cases)
- last seen: 2026-09-19T17:53:18Z

### L-026 - When a spec names a git command, name the flags that keep its behaviour independent of user and system git config such as pull.rebase, and pin that config in the real-git tests.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `git, main-process` · harmful: 0
- features: status-bar
- evidence: validation.md spec-precision note 3; src/main/git-sync.ts:35; src/main/git-sync.test.ts:337 (git, main-process)
- last seen: 2026-09-19T18:18:03Z

### L-027 - A rejection fixture must reach the guard it claims to test: a wrong-shape input that is also the wrong length dies on the length check, leaving the real guard unproven.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests/fixtures` · harmful: 0
- features: files-commits
- evidence: validation.md M1 (src/main/remote-url.ts:29; src/main/remote-url.test.ts:59) (tests/fixtures)
- last seen: 2026-09-20T22:58:11Z

### L-028 - When an AC says 'more than N', seed a fixture at exactly N: counts above and below it cannot tell > from >=.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `tests/boundaries` · harmful: 0
- features: files-commits
- evidence: validation.md M5 (src/main/commit-log.ts:82) (tests/boundaries)
- last seen: 2026-09-20T22:58:11Z

### L-029 - Promise.all returns on the first rejection and abandons its siblings still running; on Windows a child holding a temp directory as its cwd then blocks its removal, so use allSettled when every branch spawns a process.
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `src/main/**, windows` · harmful: 0
- features: files-commits
- evidence: src/main/commit-log.ts commitFiles; intermittent EPERM in commit-log.test.ts teardown (src/main/**, windows)
- last seen: 2026-09-20T22:58:11Z

### L-030 - Every acceptance criterion left to hand-verification must appear as a named line in the owner smoke script's hand-verify header or as a smoke check
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke-scripts` · harmful: 0
- features: session-idle-notifications
- evidence: NOTF-23, NOTF-06, NOTF-21 (validation.md AC table; src/main/index.ts:237,256; src/renderer/src/App.tsx:174) (smoke-scripts) (+1 more)
- last seen: 2026-09-17T01:30:15Z

### L-031 - A smoke check for a state change must start from a different state, or it cannot fail
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke-scripts` · harmful: 0
- features: session-idle-notifications
- evidence: NOTF-05 direction half (scripts/smoke-notifications.mjs:492; src/renderer/src/App.tsx:172) (smoke-scripts)
- last seen: 2026-09-17T00:29:17Z

### L-032 - When the spec leaves user-facing wording open, fix the exact wording in the spec before tests pin it
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `notifications` · harmful: 0
- features: session-idle-notifications
- evidence: validation.md spec-precision gaps (src/main/activity-notification.test.ts:116,122,126,136) (notifications)
- last seen: 2026-09-17T00:29:17Z

### L-033 - When the design replaces a mechanism a confirmed spec row names, update that spec row in the same change or mark a SPEC_DEVIATION at the code
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: session-idle-notifications
- evidence: spec.md:75 vs src/main/index.ts:81 (rev-parse --abbrev-ref vs symbolic-ref --short) — validation.md round 3 gap 2 (spec) (+1 more)
- last seen: 2026-09-17T01:50:57Z

### L-034 - When a rule says a value is never cut, test it with a long value at every place the value is rendered, not only the first
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `notifications` · harmful: 0
- features: session-idle-notifications
- evidence: V7 src/main/activity-notification.ts:86 (validation.md round 5) (notifications)
- last seen: 2026-09-17T01:50:57Z

### L-035 - In renderer components and hooks keep Date.now() out of render and setState out of synchronous effect bodies, because eslint-plugin-react-hooks v7 purity and set-state-in-effect rules fail the lint gate
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: time-tracking
- evidence: src/renderer/src/components/HoursView.tsx:53, src/renderer/src/lib/use-time.ts:60 (renderer)
- last seen: 2026-09-16T22:26:36Z

### L-036 - Assert the persisted store or sidecar write after every orchestrator state transition, not only the emitted change event
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `main-orchestrators` · harmful: 0
- features: time-tracking
- evidence: M6 src/main/time-tracker.ts:95; M19 src/main/time-tracker.ts:104 (main-orchestrators)
- last seen: 2026-09-16T22:26:36Z

### L-037 - Test an atomic file rewrite by failing the write or rename through an injected seam and asserting the previous content survives, not by checking that no tmp file remains
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: M13 src/main/time-log-store.ts:138 (file-stores)
- last seen: 2026-09-16T22:26:37Z

### L-038 - When a spec promises retry on the next write, cover every write path of the store with a fail-then-succeed test, including whole-file rewrites
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: TIME-14 src/main/time-log-store.ts:98 (file-stores)
- last seen: 2026-09-16T22:26:37Z

### L-039 - When a spec cites an owner-selected sample output, paste the literal sample into the spec, including line endings, so tests can assert it byte-for-byte
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: time-tracking
- evidence: TIME-39 / T8 src/renderer/src/lib/hours-copy.test.ts:28 (specs)
- last seen: 2026-09-16T22:26:37Z

### L-040 - After a test proves a failed write is retried, perform one more write and assert the result, so a retry flag that is never cleared is caught
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: M21 src/main/time-log-store.ts:107 (file-stores)
- last seen: 2026-09-16T22:42:48Z

### L-041 - Test interval-layout logic with several clusters in one input, not one cluster per case
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer/lib` · harmful: 0
- features: hours-calendar
- evidence: M12,M13 hours-calendar.ts:127 (renderer/lib)
- last seen: 2026-09-19T20:43:35Z

### L-042 - Cover the exact-boundary case where one interval ends as the next starts for every interval comparison
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer/lib` · harmful: 0
- features: hours-calendar
- evidence: M10 hours-calendar.ts:128 (renderer/lib)
- last seen: 2026-09-19T20:43:36Z

### L-043 - Test rounding with inputs on both sides of the half so floor, ceil and round are distinguishable
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer/lib` · harmful: 0
- features: hours-calendar
- evidence: M8 hours-calendar.ts:75 (renderer/lib)
- last seen: 2026-09-19T20:43:36Z

### L-044 - State numeric UI thresholds in the spec acceptance criterion, not only in the design
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: hours-calendar
- evidence: HCAL-12 (+1 more)
- last seen: 2026-09-19T20:43:36Z

### L-045 - A check whose assertion is satisfied by either branch of a conditional render is not evidence for either; drive the branch the criterion names from data the check itself creates.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-calendar
- evidence: HCAL-17 - scripts/smoke-hours-calendar.mjs:303-313 (smoke)
- last seen: 2026-09-19T21:43:36Z

### L-046 - A state flag that re-arms a close or cleanup rule needs a check that starts from the state where the flag is still false, not only from the common state where it is already true.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: hours-calendar
- evidence: MH - src/renderer/src/components/HoursView.tsx:123-126 (renderer)
- last seen: 2026-09-19T21:43:36Z

### L-047 - A global key handler that exempts text fields is behaviour the acceptance criterion must state, or the exemption is untestable and a mutant removing it survives.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: hours-calendar
- evidence: HCAL-25 - src/renderer/src/components/HoursView.tsx:66-67 (renderer)
- last seen: 2026-09-19T21:43:36Z

### L-048 - When an acceptance criterion gains a clause about rendered text or a visual token, add its assertion in the same change; a clause no check reads is where wrong output ships unnoticed.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: hours-calendar
- evidence: N1, N4, N5 - src/renderer/src/components/HoursView.tsx:306-327 (renderer)
- last seen: 2026-09-19T22:02:37Z

### L-049 - A count shown to the user must count what its label names; do not label a group count as a task count when a group may carry no task.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: hours-calendar
- evidence: HCAL-15 - src/renderer/src/components/HoursView.tsx:309 (renderer)
- last seen: 2026-09-19T22:02:37Z

### L-050 - Exercise a fix at the boundary value it was made for; an end-to-end check whose fixture never reaches that value cannot fail when the fix is undone.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-calendar
- evidence: P1 - src/renderer/src/components/HoursView.tsx:286 vs scripts/smoke-hours-calendar.mjs:342-356 (smoke)
- last seen: 2026-09-19T22:19:57Z

### L-051 - Before writing an edge case as 'exactly today's behaviour', read the state owner's lifecycle code (e.g. TimeTracker.ended drops the run and its paused flag); a grilled default about existing behaviour is a premise to verify, not a fact.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `spec/edge-cases` · harmful: 0
- features: session-strip-polish
- evidence: spec.md Edge Cases; src/main/time-tracker.ts:80-86 (spec/edge-cases)
- last seen: 2026-09-19T19:49:53Z

### L-052 - In a smoke that toggles state, start each check from a state the previous check confirmed and flip it, so a dead input fails its own check instead of a later one passing because nothing changed.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts/smoke-*.mjs` · harmful: 0
- features: session-strip-polish
- evidence: scripts/smoke-strip.mjs:317-320 (round 1) (scripts/smoke-*.mjs)
- last seen: 2026-09-19T19:49:54Z

### L-053 - When a task removes or renames a UI control, grep scripts/ for its label and selectors; smoke scripts are outside the unit gate and break silently.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts/smoke-*.mjs` · harmful: 0
- features: session-strip-polish
- evidence: scripts/smoke-time.mjs:188-212 (round 1) (scripts/smoke-*.mjs)
- last seen: 2026-09-19T19:49:54Z

### L-054 - When a criterion names several events or conditions (A, B or C), write one test per event or condition in which it alone decides the outcome; an it.each keeps it cheap
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `activity-machine` · harmful: 0
- features: activity-subagent-attribution
- evidence: M09 M20 M24 M26 M27 src/main/activity-machine.ts:176 (activity-machine)
- last seen: 2026-09-26T01:30:53Z

### L-055 - An edge case phrased 'whatever X is pending' needs a test with X actually pending
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `activity-machine` · harmful: 0
- features: activity-subagent-attribution
- evidence: M10 src/main/activity-machine.ts:161 (activity-machine)
- last seen: 2026-09-26T01:30:53Z

### L-056 - Assert a styled state by the value the spec names, such as its colour, not only by whether the style is present
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke-ui` · harmful: 0
- features: files-view-polish
- evidence: FPOL-02 scripts/smoke-files-diff.mjs:322 (smoke-ui)
- last seen: 2026-09-26T17:54:24Z

### L-057 - When a change widens a condition to more elements, assert that the elements it still excludes lack the element
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke-ui` · harmful: 0
- features: files-view-polish
- evidence: FPOL-02 src/renderer/src/components/FileTabs.tsx:241 (smoke-ui)
- last seen: 2026-09-26T17:54:24Z

### L-058 - Budget entry-chunk growth against the unminified renderer build, where eager glue code counts byte for byte
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `renderer-build` · harmful: 0
- features: file-icons
- evidence: tasks.md T6 SPEC_DEVIATION (entry chunk +4,633 B vs 1 KB) (renderer-build)
- last seen: 2026-09-26T17:05:30Z

### L-059 - When an AC keeps today's look as a fallback, name the fallback for elements that had nothing before
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer-ui` · harmful: 0
- features: file-icons
- evidence: FICN-13 (validation.md, FileIcon.tsx:53-62) (renderer-ui)
- last seen: 2026-09-26T17:05:30Z

### L-060 - When several sources feed one hover or focus state, read the view after each source's leave before the next source enters, because the next enter overwrites a leave that never fired
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-task-focus
- evidence: validation.md SM1; scripts/smoke-hours-calendar.mjs:818-838; HTF-08 (smoke)
- last seen: 2026-09-26T21:15:08Z

### L-061 - When an acceptance criterion names several sources for one behaviour, give each source its own check; covering one source leaves the others unverified
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-task-focus
- evidence: HTF-09; scripts/smoke-hours-calendar.mjs:829-838 (smoke)
- last seen: 2026-09-26T21:15:08Z

### L-062 - When the spec fixes exact colour values, assert the computed colours against those values in order, not only that they are distinct
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-task-focus
- evidence: HTF-01; scripts/smoke-hours-calendar.mjs:739 (smoke)
- last seen: 2026-09-26T21:15:09Z

### L-063 - When a spec edge case states what an element shows, assert each stated value on screen, not only that the element is present
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-task-focus
- evidence: validation.md SM7; scripts/smoke-hours-calendar.mjs:928; spec edge case 4 (smoke) (smoke)
- last seen: 2026-09-26T21:48:16Z

### L-064 - Quote UI text in the spec only as the app renders it; check a literal against the formatter before writing it in backticks
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: hours-task-focus
- evidence: spec.md edge case 4; src/renderer/src/components/HoursLegend.tsx:54 (0m vs 0h00) (specs)
- last seen: 2026-09-26T21:48:16Z

### L-065 - When a rule matches items by one of two coordinates, give the test a fixture where the two coordinates disagree, or matching by the wrong one still passes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: diff-fold-refresh
- evidence: U10 src/renderer/src/lib/diff-view.test.ts:616 (testing)
- last seen: 2026-09-27T13:52:57Z

### L-066 - Test a range-overlap rule with two ranges that only touch, or a strict and a non-strict comparison cannot be told apart
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: diff-fold-refresh
- evidence: U15 src/renderer/src/lib/diff-view.ts overlaps (testing)
- last seen: 2026-09-27T13:52:57Z

### L-067 - When a spec defines a partial form of a state, every rule that names the state must say whether the partial form counts, and a test must pin that reading
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: diff-fold-refresh
- evidence: FOLD-06 / U07 src/renderer/src/lib/diff-view.ts foldPlan (spec)
- last seen: 2026-09-27T13:52:57Z

### L-068 - Assert a Monaco editor's scroll position by its first rendered line number, never by a scrollable element's scrollTop, which stays 0 under virtual scrolling
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: diff-fold-refresh
- evidence: FOLD-09 scripts/smoke-files-diff.mjs:876 (scripts/smoke)
- last seen: 2026-09-27T13:52:57Z

### L-069 - When a component rule moves into a pure seam, also mutate the call site's arguments: the seam's tests cannot see a caller that passes the wrong state
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer components` · harmful: 0
- features: diff-fold-refresh
- evidence: validation.md V8 (DiffViewer.tsx:307 call site of readingBeforeUpdate) (renderer components)
- last seen: 2026-09-27T14:34:31Z

### L-070 - Assert a reused component in every host the spec names at runtime; a citation that the host mounts it does not kill a host-specific branch or style override
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: files-status-glyphs
- evidence: FSTS-21 / S8b (validation.md; src/renderer/src/components/CommitTab.tsx:43) (scripts/smoke)
- last seen: 2026-09-27T15:46:21Z

### L-071 - Assert a reused component in every host the spec names at runtime; a citation that the host mounts it does not kill a host-specific branch or style override
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: files-status-glyphs
- evidence: S11 src/renderer/src/components/DiffSection.css:78 (validation.md) (scripts/smoke)
- last seen: 2026-09-27T15:46:21Z

### L-072 - When an AC names an ellipsis, assert the computed text-overflow as well as scrollWidth > clientWidth; overflow alone passes when the text is clipped bare
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: files-status-glyphs
- evidence: S10 src/renderer/src/components/FileTree.css:112; FSTS-04/20 (validation.md) (scripts/smoke)
- last seen: 2026-09-27T15:46:21Z

### L-073 - Assert a smoke-checked indicator is painted (visibility, ancestor opacity, box size) as well as its text, title and position; DOM reads pass on a hidden element
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `scripts/smoke` · harmful: 0
- features: files-status-glyphs
- evidence: S7 src/renderer/src/components/FileTree.css:134 (validation.md) (scripts/smoke)
- last seen: 2026-09-27T15:46:21Z

### L-074 - A computed text-overflow of ellipsis is set even when nothing is clipped; assert overflow other than visible and nowrap with it, or the drawn result, never text-overflow alone
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke-cdp` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 2: R5, R5h (FSTS-04, FSTS-20); smoke-files-diff.mjs:929,1177 (smoke-cdp)
- last seen: 2026-09-27T16:29:15Z

### L-075 - When an AC applies conditional clauses to every host of a reused component, seed each condition in every host, or that host's check cannot exercise the clause
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `smoke-cdp` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 2: R7 (FSTS-21 clause 20); smoke-files-diff.mjs:1403 (smoke-cdp)
- last seen: 2026-09-27T16:29:15Z

### L-076 - When an AC says an overflowing value is cut, also state that a value that fits shows whole, so a cap that cuts every value can fail a check
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 2: R6 (FSTS-04, FSTS-20) (specs)
- last seen: 2026-09-27T16:29:15Z

### L-077 - When a trailing badge must stay readable, assert that the element before it ends before the badge begins; DOM order and the badge's edge do not prove nothing is drawn under it
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 3: V1, V1h, V4, V4h (smoke)
- last seen: 2026-09-27T17:26:34Z

### L-078 - For a fits-shows-whole criterion, sample a value that fits within a few pixels of its space, or a width cap between the widest sample and the space passes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 3: V6, V6h (smoke)
- last seen: 2026-09-27T17:26:34Z

### L-079 - Measure an overlap on the badge's own box, not on the wrapper that holds it; a child drawn outside its parent's box passes a check on the parent
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: files-status-glyphs
- evidence: validation.md round 4: W4, W4h (smoke LAYOUT) (smoke)
- last seen: 2026-09-27T18:08:55Z

### L-080 - Give a defensive branch that keeps an item on an unexpected filesystem error its own test with an injected failure, and a reason text that names what actually happened
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `main-process` · harmful: 0
- features: files-discard
- evidence: validation.md U15 (file-discard.ts:169) (main-process)
- last seen: 2026-09-27T21:04:56Z

### L-081 - When a helper branches on a status together with an optional field, add a test row for every combination the parser can produce, not only one row per status
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer-lib` · harmful: 0
- features: files-discard
- evidence: validation.md V2 (discard-view.ts:117) (renderer-lib)
- last seen: 2026-09-27T21:04:56Z

### L-082 - When one item touches several paths in sequence, state in the spec whether a refusal on a later path undoes the earlier moves or only reports the item kept
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: files-discard
- evidence: validation.md gap 2 (FDSC-47 vs FDSC-27) (spec)
- last seen: 2026-09-27T21:04:56Z

### L-083 - When a safety rule exempts links from a move, state what happens to links nested inside a folder that is moved whole
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: files-discard
- evidence: validation.md gap 3 (FDSC-22 vs FDSC-43) (spec)
- last seen: 2026-09-27T21:04:56Z

### L-084 - When a confirmation captures the items a request will send, capture and send the target they were listed from with them, and state that pairing in the spec
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: files-discard
- evidence: validation.md gap 4 (FDSC-42, FDSC-45) (spec)
- last seen: 2026-09-27T21:04:56Z

### L-085 - When one AC orders a list and another splits it under headings, state whether the order holds within each group or across the whole list
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: files-discard
- evidence: validation.md gap 1 (FDSC-10 vs FDSC-11) (spec)
- last seen: 2026-09-27T21:04:56Z

### L-086 - When a design restructures an element that an earlier feature's smoke checks measure, name those checks in the design so the structure is chosen once
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `design` · harmful: 0
- features: files-discard
- evidence: SPEC_DEVIATION FileTree.tsx ChangedRows, DiffSection.tsx header (design)
- last seen: 2026-09-27T21:04:56Z

### L-087 - For a rule that rejects when either of two parts fails, test each arm alone: a case where both fail cannot tell || from &&.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: hours-task-assign
- evidence: src/main/time-tracker.ts:242 (U12) (src/main)
- last seen: 2026-09-28T00:27:37Z

### L-088 - When a mark on screen shows a stored flag, the smoke needs a row where the flag and the value it usually follows disagree, or a mark derived from that value passes.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `smoke` · harmful: 0
- features: hours-task-assign
- evidence: src/renderer/src/components/PeriodRow.tsx hand mark (S2) (smoke)
- last seen: 2026-09-28T00:27:37Z

### L-089 - Test an optional-field validator with every value class it must accept or reject (absent, true, false, null, wrong type), not one wrong-type sample.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: hours-task-assign
- evidence: src/main/time-log-store.ts:28 (U19, U20) (src/main)
- last seen: 2026-09-28T00:27:37Z

### L-090 - A 'no change when already X' criterion must say whether X is the explicit setting or the effective value, e.g. a session link versus the task its branch names.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · harmful: 0
- features: hours-task-assign
- evidence: HTSK-14
- last seen: 2026-09-28T00:27:37Z

### L-091 - When a spec states a round-trip property between a renderer and its inverse parser, test it over templates that exercise every structural position of each empty-able placeholder (leading, middle, trailing segment), not only the examples named in the spec
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `shared-tasks` · harmful: 0
- features: auto-pin-from-worktrees
- evidence: APIN-04 AC 8; src/shared/tasks.ts:115-119 (shared-tasks)
- last seen: 2026-09-29T13:32:34Z

### L-092 - Give every spec edge case that crosses two operations (such as undo then redo) its own unit test even when a live check covers it, since only the unit test fails when one side regresses
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: auto-pin-from-worktrees
- evidence: M18; src/main/task-board.ts unpin; spec Edge Case 5 (testing)
- last seen: 2026-09-29T13:32:35Z

### L-093 - When a spec requires a template to be parseable back into its values, state which templates are unsupported because adjacent placeholders make the rendered text ambiguous
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: auto-pin-from-worktrees
- evidence: APIN-04 AC 8 ({usId}{id} -> 94821) (specs)
- last seen: 2026-09-29T13:32:35Z

### L-094 - When a spec splits one existing list into several views, state which view each existing entry point and highlight lands on for items that moved out of the default view
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer-dialogs` · harmful: 0
- features: agent-isolation-level
- evidence: validation.md G1; src/renderer/src/components/NewSessionDialog.tsx:217-220 (renderer-dialogs)
- last seen: 2026-09-29T20:52:08Z

### L-095 - A PowerShell snippet published for scripts or agents must call Invoke-WebRequest -UseBasicParsing: Windows PowerShell 5.1 otherwise prompts after the response, so a non-interactive caller errors although the request succeeded.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `docs` · harmful: 0
- features: agent-task-link
- evidence: validation.md round 1 gap 2; README.md:49 (ATSK-12) (docs)
- last seen: 2026-09-28T22:09:36Z

### L-096 - When a design changes an element that an earlier feature's spec already constrains, cite that requirement in the design and either amend it or keep it explicitly, so the implementer never has to choose between the two
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `design` · harmful: 0
- features: multi-agent-performance
- evidence: src/renderer/src/components/AgentsView.tsx:225 SPEC_DEVIATION (PERF-10 pill title vs STRP-05) (design)
- last seen: 2026-10-01T20:45:03Z

### L-097 - For a queue or scheduler, test that it goes idle when it cannot make progress (no pending deferred turn while at capacity), not only that it never exceeds capacity: a loosened outer guard keeps the cap but spins the event loop
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing/schedulers` · harmful: 0
- features: multi-agent-performance
- evidence: src/main/spawn-pacer.ts:27 (P8 mutant 2) (testing/schedulers)
- last seen: 2026-10-01T22:23:16Z

### L-098 - Word a child-process exit AC in the fields the platform exit event actually carries (Electron utilityProcess exit gives only a code), never an undefined exit reason
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `electron-process` · harmful: 0
- features: pty-host
- evidence: PTYH-27 (src/main/pty-host-client.test.ts:300) (electron-process)
- last seen: 2026-10-02T17:30:39Z

### L-099 - When a spec edge case restates existing behaviour as today, cite a test that already pins it or add one; unchanged code is not evidence
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: pty-host
- evidence: Edge case resize zero dims (src/main/session-manager.ts:338) (testing)
- last seen: 2026-10-02T17:30:44Z

### L-100 - To cancel async work that was in flight at a reset, compare a generation counter captured at start instead of a sticky disposed flag, so work started after a non-terminal reset still runs
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `session-manager` · harmful: 0
- features: pty-host
- evidence: SPEC_DEVIATION src/main/session-manager.ts:126 (session-manager)
- last seen: 2026-10-02T17:30:50Z

### L-101 - When an error branch needs an I/O failure the OS cannot produce portably, fail the call through a mocked module or injected seam instead of leaving the branch untested
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: agent-prompts
- evidence: M17 src/main/prompt-library.ts:39 (APR-06 unreadable) (testing)
- last seen: 2026-10-03T12:22:13Z

### L-102 - Lift every behavioural rule stated in the spec's assumptions table into a numbered acceptance criterion, or it ships unimplemented and untested
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `spec` · harmful: 0
- features: agent-prompts
- evidence: spec.md Assumptions 'Value whitespace' vs NewSessionDialog.tsx:172-173 (spec)
- last seen: 2026-10-03T12:22:14Z

### L-103 - When main re-checks a rule the renderer already enforces, state the rejection message in the spec so the backstop test can assert it
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `main-backstop` · harmful: 0
- features: agent-prompts
- evidence: validation.md APR-26 backstop: src/main/session-manager.test.ts:1498 asserts only .rejects.toThrow() (main-backstop)
- last seen: 2026-10-03T12:45:36Z

### L-104 - State an edge-case tolerance against the same floored quantity the main criterion uses, or the tolerance cannot hold at fractional sizes
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer layout` · harmful: 0
- features: terminal-last-row
- evidence: validation.md Spec-Precision Gaps 1 (Edge case 1 vs P1 AC3) (renderer layout)
- last seen: 2026-10-03T10:53:15Z

### L-105 - When a layout criterion is measured against an inner element, also require that element to fill its container, or a frozen inner element satisfies it
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `renderer layout` · harmful: 0
- features: terminal-last-row
- evidence: validation.md Spec-Precision Gaps 2 (P1 AC3/AC4, mutant V-S1) (renderer layout)
- last seen: 2026-10-03T10:53:15Z

### L-106 - When a pick is ranked by several tie-break keys, give each adjacent pair of keys a fixture where they disagree, or dropping or reordering a key still passes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: hours-hatching
- evidence: validation.md U4, U5 (src/renderer/src/lib/hours-calendar.ts:242) (testing)
- last seen: 2026-10-03T11:13:28Z

### L-107 - Test a guard's placement before a destructive step with a fixture the code path can see; a fixture the tool cannot read skips the step and the test passes for the wrong reason.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main tests` · harmful: 0
- features: branch-slug-short
- evidence: validation.md W3, W4 (src/main/worktree-manager.ts:93-94; src/main/worktree-manager.test.ts:759) (src/main tests)
- last seen: 2026-10-03T12:50:22Z

### L-108 - When a measurement shows an edge case's state cannot occur, restate the edge case at the nearest state that still exercises the guard, not only its tests.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: branch-slug-short
- evidence: BSLG-38 (validation.md edge cases; src/main/worktree-manager.test.ts:759) (specs)
- last seen: 2026-10-03T12:50:22Z

### L-109 - When a spec applies a rule again on a fallback path, assert the rule on that path too.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/shared` · harmful: 0
- features: branch-slug-short
- evidence: validation.md S11 (src/shared/tasks.ts:57; BSLG-06) (src/shared)
- last seen: 2026-10-03T12:50:22Z

### L-110 - Test a platform gate with at least two non-target platforms, or a gate keyed on the wrong platform survives.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main` · harmful: 0
- features: branch-slug-short
- evidence: validation.md C1 (src/main/path-limits.ts:94; src/main/path-limits.test.ts:297) (src/main)
- last seen: 2026-10-03T12:50:22Z

### L-111 - A test of a pure stale-answer helper does not prove the hook passes it the current key; give the hook wiring its own discriminating check.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer hooks` · harmful: 0
- features: branch-slug-short
- evidence: validation.md SM-A (src/renderer/src/lib/use-path-check.ts:68; BSLG-42) (renderer hooks)
- last seen: 2026-10-03T12:50:22Z

### L-112 - When a factory decides enabled-vs-no-op before touching real ports (timer, monitor, file), inject those ports with optional overrides so the disabled test can assert zero calls; checking only the returned no-op and an empty folder lets a leaked timer or monitor survive.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: perf-diagnostics
- evidence: src/main/diagnostics.ts:461 (M5/M6) (src/main/**)
- last seen: 2026-10-03T14:19:26Z

### L-113 - When design.md fixes a printed output's exact layout, re-read the spec ACs that describe that output against it (where each figure appears, every verdict value it can print) and align the wording before Execute.
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: perf-diagnostics
- evidence: PDIAG-36/PDIAG-37 vs design.md:225-237 (specs)
- last seen: 2026-10-03T14:19:26Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
