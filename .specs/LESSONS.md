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

### L-017 - In renderer components and hooks keep Date.now() out of render and setState out of synchronous effect bodies, because eslint-plugin-react-hooks v7 purity and set-state-in-effect rules fail the lint gate
- signal: `gate_fail` · recurrence: 1 feature(s) · scope: `renderer` · harmful: 0
- features: time-tracking
- evidence: src/renderer/src/components/HoursView.tsx:53, src/renderer/src/lib/use-time.ts:60 (renderer)
- last seen: 2026-09-16T22:26:36Z

### L-018 - Assert the persisted store or sidecar write after every orchestrator state transition, not only the emitted change event
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `main-orchestrators` · harmful: 0
- features: time-tracking
- evidence: M6 src/main/time-tracker.ts:95; M19 src/main/time-tracker.ts:104 (main-orchestrators)
- last seen: 2026-09-16T22:26:36Z

### L-019 - Test an atomic file rewrite by failing the write or rename through an injected seam and asserting the previous content survives, not by checking that no tmp file remains
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: M13 src/main/time-log-store.ts:138 (file-stores)
- last seen: 2026-09-16T22:26:37Z

### L-020 - When a spec promises retry on the next write, cover every write path of the store with a fail-then-succeed test, including whole-file rewrites
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: TIME-14 src/main/time-log-store.ts:98 (file-stores)
- last seen: 2026-09-16T22:26:37Z

### L-021 - When a spec cites an owner-selected sample output, paste the literal sample into the spec, including line endings, so tests can assert it byte-for-byte
- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `specs` · harmful: 0
- features: time-tracking
- evidence: TIME-39 / T8 src/renderer/src/lib/hours-copy.test.ts:28 (specs)
- last seen: 2026-09-16T22:26:37Z

### L-022 - After a test proves a failed write is retried, perform one more write and assert the result, so a retry flag that is never cleared is caught
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `file-stores` · harmful: 0
- features: time-tracking
- evidence: M21 src/main/time-log-store.ts:107 (file-stores)
- last seen: 2026-09-16T22:42:48Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
