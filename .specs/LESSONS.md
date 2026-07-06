# LESSONS — auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation — do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 — When a design types a cross-phase dependency as required, wire the producer and consumer in one phase (or gate the field) rather than relaxing it to optional to keep an interim phase's typecheck green
- signal: `spec_deviation` · recurrence: 1 feature(s) · scope: `workflow-ctx` · harmful: 0
- features: workflows-agent-step
- evidence: src/main/workflow-ctx.ts:82,106 (CtxDeps.agent / CtxRuntime.signal SPEC_DEVIATION) (workflow-ctx)
- last seen: 2026-07-06T13:28:04Z

## Quarantined (failed when applied — ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
