# CI PR Gate Specification

## Problem Statement

The quality gate (`typecheck && lint && test`) only runs on release tags (`v*`)
and manual nightly dispatch. The repo's flow is PR-per-feature merging into
`main`, so every PR can merge with no automated CI gate. Regressions reach
`main` undetected until a release is cut.

## Goals

- [ ] Every PR and every push runs `typecheck`, `lint`, and `test` automatically.
- [ ] A red gate is visible on the PR before merge.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Building the Windows installer in PR CI | Release/nightly already build; PR gate only needs typecheck/lint/test. |
| Coverage threshold enforcement | Covered by `coverage-reporting` (report-only, AD-003). |
| Caching beyond `actions/setup-node` npm cache | Premature optimization. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Runner OS | `ubuntu-latest` | AD-002: gate runs no Windows build; tests largely OS-independent. | y |
| Node version | `22` | Matches release/nightly workflows. | y |
| Unit tests pass on Linux | yes | Tests use temp dirs + pure parsing + real git (available on ubuntu). | n (validated by first CI run) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Automated gate on every PR ⭐ MVP

**User Story**: As a maintainer, I want the quality gate to run on every PR so
that no regression merges into `main` silently.

**Why P1**: It is the entire point of the feature.

**Acceptance Criteria**:

1. WHEN a pull request is opened or updated THEN CI SHALL run `npm ci` followed by `npm run typecheck`, `npm run lint`, and `npm test`.
2. WHEN a commit is pushed to any branch THEN the same gate SHALL run.
3. WHEN any gate step exits non-zero THEN the workflow SHALL fail (red check on the PR).
4. WHEN all gate steps pass THEN the workflow SHALL succeed (green check).

**Independent Test**: Open a PR with a deliberate type error → CI fails; fix it → CI passes.

---

## Edge Cases

- WHEN `npm ci` fails (lockfile drift) THEN the workflow SHALL fail before the gate steps.
- WHEN a unit test is OS-specific and fails on Linux THEN the run surfaces it; remediation is pin-to-windows or guard the test (tracked, not pre-solved).

---

## Requirement Traceability

| Requirement ID | Story       | Phase   | Status  |
| -------------- | ----------- | ------- | ------- |
| CI-01          | P1          | Execute | Pending |
| CI-02          | P1          | Execute | Pending |
| CI-03          | P1          | Execute | Pending |
| CI-04          | P1          | Execute | Pending |

**Coverage:** 4 total.

---

## Success Criteria

- [ ] A `ci.yml` workflow exists, triggered on `pull_request` and `push`.
- [ ] The workflow runs the full gate and reflects pass/fail as a check.
