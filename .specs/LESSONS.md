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

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-003 - When wrapping a spawned process with a timeout, settle the promise on 'exit' plus a short flush grace period, never on 'close' alone: 'close' waits for stdio EOF and killing a shell does not kill its children, so a surviving grandchild holds the inherited pipes and the promise can lag by seconds or never settle
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `child-process` · harmful: 0
- features: worktree-post-create-hook
- evidence: validation.md round-1 blocker; src/main/hook-shell.ts:71 (child-process)
- last seen: 2026-07-29T22:37:03Z

### L-004 - Assert a spec-defined bound against its literal value, not against the constant that implements it: expect(x).toHaveLength(MAX_CHARS) is self-referential and survives a mutation of MAX_CHARS itself
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook
- evidence: mutant R1/M7; post-create-hook.test.ts output-tail test (testing)
- last seen: 2026-07-29T22:37:04Z

### L-006 - Assert a returned payload field by its value, not by the value you handed an injected fake: a field that appears in the test only as a spy's input reads like coverage in review, but a mutation dropping it from the real return still passes
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-removal-fault-tolerance
- evidence: round-1 mutant M6; worktree-manager.test.ts leftover: at :844/:867/:882 were spyDeleter inputs, not assertions - dropping the field from worktree-manager.ts:335-339 left all 80 tests green; closed by F1 124340c (testing)
- last seen: 2026-07-31T12:27:40Z

### L-007 - When writing a test to kill a specific surviving mutant, check the fixture does not encode that mutant's own blind spot: pick one whose readings differ under every wrong implementation, not just the one you saw. A directories-only residue pinned the recursive count yet let a directories-only count survive
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-removal-fault-tolerance
- evidence: round-2 mutant N3 survived the round-1 fix F2 (dir-remover.test.ts:328-348 fixture wt/keep/a/b was directories-only); closed by F3 1abe8aa with a mixed chain giving 3/2/1/1 for every-entry/dirs-only/files-only/top-level (testing)
- last seen: 2026-07-31T12:27:40Z

### L-008 - When a hard-coded value becomes a lookup table keyed by an existing enum, test the wiring from key to entry, not just the table: asserting the table's contents leaves the new key free to silently resolve to the old entry, and a guard that returns before any side effect (a missing-path check) usually makes that routing assertable without touching the real subsystem.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/main/**` · harmful: 0
- features: vs2026-admin-shortcut
- evidence: M4/M5: launch() -> VS_EDITIONS[tool]; openVisualStudio(edition) (src/main/**)
- last seen: 2026-08-28T19:48:01Z

### L-009 - A default-constant test that asserts resolvePaneWidth(undefined, bounds, DEFAULT) against DEFAULT itself cannot detect a change to that constant — pin every spec-derived default with a literal assertion, not a self-referential one.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `renderer/lib` · harmful: 0
- features: sidebar-resize-collapse
- evidence: src/renderer/src/lib/pane-layout.test.ts:41 (renderer/lib)
- last seen: 2026-08-31T22:35:36Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
