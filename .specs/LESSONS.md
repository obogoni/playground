# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

### L-001 — When a design types a cross-phase dependency as required, wire the producer and consumer in one phase (or gate the field) rather than relaxing it to optional to keep an interim phase's typecheck green
- signal: `spec_deviation` · recurrence: 2 feature(s) · scope: `workflow-ctx` · harmful: 0
- features: workflows-agent-step, workflows-blocker-resume
- evidence: src/main/workflow-ctx.ts:82,106 (CtxDeps.agent / CtxRuntime.signal SPEC_DEVIATION) (workflow-ctx) (+1 more)
- last seen: 2026-07-06T16:15:40Z

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-002 — Before a UI design references a shared CSS keyframe as 'existing', grep global.css to confirm it exists — the WHF handoff assumed pulse/blink existed but global.css only had fadeIn/popIn/toastIn, forcing a component-local @keyframes pulse.
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `src/renderer/**/*.css` · harmful: 0
- features: workflows-ui-hifi
- evidence: RunDetail.css:14 / WorkflowsView.css:21 (SPEC_DEVIATION pulse keyframe) (src/renderer/**/*.css)
- last seen: 2026-07-06T21:57:51Z

### L-003 — When wrapping a spawned process with a timeout, settle the promise on 'exit' plus a short flush grace period, never on 'close' alone: 'close' waits for stdio EOF and killing a shell does not kill its children, so a surviving grandchild holds the inherited pipes and the promise can lag by seconds or never settle
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `child-process` · harmful: 0
- features: worktree-post-create-hook
- evidence: validation.md round-1 blocker; src/main/hook-shell.ts:71 (child-process)
- last seen: 2026-07-29T22:37:03Z

### L-004 — Assert a spec-defined bound against its literal value, not against the constant that implements it: expect(x).toHaveLength(MAX_CHARS) is self-referential and survives a mutation of MAX_CHARS itself
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook
- evidence: mutant R1/M7; post-create-hook.test.ts output-tail test (testing)
- last seen: 2026-07-29T22:37:04Z

### L-005 — Before adding real-process or real-git tests, check whether existing suites already sit near the default per-test timeout: the extra parallel load alone can push them over it, turning a green gate red without any production change
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `testing` · harmful: 0
- features: worktree-post-create-hook
- evidence: validation.md round-2 gate section; tree.test.ts / worktree-manager.test.ts timeouts (testing)
- last seen: 2026-07-29T22:37:06Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
