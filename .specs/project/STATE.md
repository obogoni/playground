# State

**Last Updated:** 2026-06-11
**Current Work:** app-skeleton (M1) — spec drafted, awaiting user approval before Design

---

## Recent Decisions (Last 60 days)

### AD-001: PRD issue #1 and design handoff are the dual sources of truth (2026-06-11)

**Decision:** GitHub issue #1 governs behavior/architecture; `design_handoff_worktree_manager/` (README + `Worktree Manager.dc.html`) governs visual fidelity. The `.dc.html` prototype is reference-only, never shipped.
**Reason:** Both artifacts are explicit and detailed; duplicating them into specs would drift.
**Trade-off:** Feature specs stay thinner and reference these artifacts instead of restating them.
**Impact:** Every feature spec links back to PRD user-story numbers and handoff sections.

### AD-002: Roadmap follows the PRD's suggested slice ordering (2026-06-11)

**Decision:** Four milestones — M1 skeleton+sidebar+shortcuts, M2 worktree lifecycle, M3 ADO tasks+start-work, M4 board view+config — matching the PRD's 7-slice ordering.
**Reason:** PRD explicitly notes the app is daily-usable after slice 3 (end of M1); honoring that maximizes early value.
**Trade-off:** ADO integration (the headline feature) lands third, not first.
**Impact:** M1 must ship a polished tree+detail UI since it's used daily before ADO exists.

---

## Active Blockers

(none)

---

## Lessons Learned

(none yet)

---

## Quick Tasks Completed

| #   | Description | Date | Commit | Status |
| --- | ----------- | ---- | ------ | ------ |

---

## Deferred Ideas

- [ ] All v2 items tracked in PRD "Out of Scope" (terminal hosting, agent management, ADO writes, query feeds) — Captured during: project init

---

## Todos

- [ ] Get spec approval for app-skeleton, then Design (build tooling choice: Electron Forge vs electron-vite — decide there)

---

## Preferences

**Model Guidance Shown:** never
