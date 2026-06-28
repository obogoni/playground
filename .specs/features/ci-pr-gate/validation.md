# ci-pr-gate — Validation

**Verdict: PASS** (operational verification; remote trigger pending first PR run)
**Diff range:** `a464391` (branch `feature/ci-pr-gate`)

## Per-AC evidence

| AC | Outcome | Evidence |
| -- | ------- | -------- |
| CI-01 (gate on PR) | PASS (config) | `ci.yml` `on: pull_request`; step runs `npm ci` → `typecheck` → `lint` → `test`. |
| CI-02 (gate on push) | PASS (config) | `ci.yml` `on: push`. |
| CI-03 (red gate fails) | PASS (logic) | Gate is a single `&&` chain; any non-zero step fails the job. Verified locally: full gate exits 0 when green; a forced type error exits non-zero. |
| CI-04 (green passes) | PASS | Local gate green: typecheck OK, lint 0 errors, 200 tests pass. |

## Discrimination sensor
N/A — workflow YAML, not unit-testable. The meaningful local check (gate commands run green) was performed.

## Notes
The `pull_request`/`push` trigger itself is only observable once a PR is opened on GitHub (AD-002 risk: any OS-specific test failure on ubuntu forces a pin to windows-latest). Authoritative confirmation = first CI run.
