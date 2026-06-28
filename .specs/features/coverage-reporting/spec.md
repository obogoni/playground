# Coverage Reporting Specification

## Problem Statement

Despite a strong testing culture (125 tests), no coverage tool is configured, so
there is no visibility into which logic-bearing modules are under-tested or when
coverage regresses. This is report-only for now — establish a baseline before
considering an enforcing threshold.

## Goals

- [ ] A `test:coverage` script produces a coverage report for the logic layers.
- [ ] The report is visible in CI without failing the build.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Failing threshold gate | AD-003: report-only first; thresholds layered on later once baseline is known. |
| Covering renderer components / thin shells | Intentionally uncovered by convention. |
| Uploading to an external coverage service (Codecov etc.) | Not requested. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Coverage provider | `@vitest/coverage-v8` | Native Vitest provider, no extra config. | y |
| Include globs | `src/main/**`, `src/shared/**` | The logic layers that carry unit tests; excludes renderer + thin shells per convention. | n |
| Enforcement | none (report-only) | AD-003. | y |
| Where it runs in CI | a non-blocking step (or alongside the gate) in `ci.yml` | Visibility without blocking; depends on `ci-pr-gate`. | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Coverage report on demand and in CI ⭐ MVP

**User Story**: As a maintainer, I want a coverage report so that I can see which
logic modules are under-tested without it blocking merges yet.

**Why P1**: The feature.

**Acceptance Criteria**:

1. WHEN `npm run test:coverage` runs THEN it SHALL produce a coverage report scoped to `src/main/**` and `src/shared/**`.
2. WHEN coverage is below any value THEN the command SHALL still exit 0 (report-only, no threshold gate).
3. WHEN CI runs THEN the coverage report SHALL be produced/visible without failing the workflow.

**Independent Test**: Run `npm run test:coverage` locally → a report is emitted and the command exits 0 regardless of the numbers.

---

## Edge Cases

- WHEN `@vitest/coverage-v8` is missing THEN `test:coverage` SHALL fail clearly (dependency must be installed) — but the normal `test` script SHALL remain unaffected.
- WHEN run in CI THEN coverage SHALL not double-count or interfere with the plain `test` step of the gate.

---

## Requirement Traceability

| Requirement ID | Story | Phase   | Status  |
| -------------- | ----- | ------- | ------- |
| COVR-01        | P1    | Execute | Pending |
| COVR-02        | P1    | Execute | Pending |
| COVR-03        | P1    | Execute | Pending |

**Coverage:** 3 total. Depends on `ci-pr-gate`.

---

## Success Criteria

- [ ] `test:coverage` script exists and emits a report for the logic layers.
- [ ] CI surfaces coverage without blocking merges.
