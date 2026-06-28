# Project State

Project memory for the ADO Task & Worktree Manager. Decisions log (AD-NNN) +
Handoff snapshot.

## Decisions

| ID     | Date       | Decision | Rationale |
| ------ | ---------- | -------- | --------- |
| AD-001 | 2026-06-28 | A technical-debt remediation batch was opened from a repo audit. Five items registered as features and attacked in sequence: `ci-pr-gate` (#1) → `agent-form-stable-key` (#2) → `app-hooks-extraction` (#3) → `ado-fetch-timeout` (#9) → `coverage-reporting` (#12). | Audit found localized, actionable debt; sequencing front-loads the safety net (CI gate) before the behavioral fixes and refactor. |
| AD-002 | 2026-06-28 | The PR quality gate (`ci-pr-gate`) runs on **ubuntu-latest** (not the windows-latest used by release/nightly). | The gate only runs typecheck/lint/test (no Windows installer build); unit tests are largely OS-independent (temp dirs, pure parsing). Cheaper/faster than Windows. Risk: any OS-specific test failure forces a pin to windows-latest or a guard. |
| AD-003 | 2026-06-28 | Test coverage (`coverage-reporting`) is **report-only** — `@vitest/coverage-v8` + a `test:coverage` script, printed in CI, with **no failing threshold gate**. | Establish a baseline first; a blocking threshold can be layered on later once the real coverage numbers are known. |
| AD-004 | 2026-06-28 | The `App.tsx` god-component refactor (`app-hooks-extraction`) is **incremental** — extract `useSessions` + `useTree` now; `useTasks`/`useConfig` deferred. | Smaller, lower-risk PR; the renderer has no unit tests by convention, so the extracted hooks become the first testable seam. |

## Handoff

**Status:** Technical-debt batch (AD-001) implemented. Each feature is committed on
its own branch (PR-per-feature convention); none merged yet. Independent
verification ran (standalone `validate.md` fallback): all PASS, discrimination
sensor killed 3/3 mutations on the tested logic. See each feature's `validation.md`.

**Next action:** open the five PRs (each body: `Closes #<n>` once synced via
`tlc-to-issues`), then merge in order — `ci-pr-gate` first so the gate guards the
rest; merge `coverage-reporting` after `ci-pr-gate` (it branches off it).

| Feature | Branch | Commit | Verdict |
| ------- | ------ | ------ | ------- |
| ci-pr-gate (#1) | `feature/ci-pr-gate` | `a464391` | PASS (remote trigger pending first PR) |
| agent-form-stable-key (#2) | `feature/agent-form-stable-key` | `c3dea60` | PASS |
| app-hooks-extraction (#3) | `feature/app-hooks-extraction` | `570c2d7` | PASS (CDP smoke pending) |
| ado-fetch-timeout (#9) | `feature/ado-fetch-timeout` | `04de856` | PASS |
| coverage-reporting (#12) | `feature/coverage-reporting` (off #1) | `cf422c5` | PASS (report-only) |

**Open follow-ups (not in this batch):** 3 pre-existing transitive dev advisories
(esbuild/form-data/undici) surfaced during the coverage install — candidate debt item.
