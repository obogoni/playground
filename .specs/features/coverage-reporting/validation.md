# coverage-reporting — Validation

**Verdict: PASS** (report-only)
**Diff range:** `cf422c5` (branch `feature/coverage-reporting`, off `feature/ci-pr-gate`)

## Per-AC evidence

| AC | Outcome | Evidence |
| -- | ------- | -------- |
| COVR-01 (report scoped to main + shared) | PASS (config) | `vitest.config.ts` `coverage.include: ['src/main/**/*.ts','src/shared/**/*.ts']`, provider v8; `test:coverage` script emits a text + text-summary report (baseline ~68% stmts locally). |
| COVR-02 (exits 0 regardless) | PASS | `npm run test:coverage` exits 0; no thresholds configured. |
| COVR-03 (visible in CI, non-blocking) | PASS (config) | `ci.yml` "Coverage (report-only)" step with `continue-on-error: true` after the gate. |

## Discrimination sensor
N/A — config/tooling change, no behavioral logic added.

## Notes / known caveat
On local Windows the v8 provider renders only a subset of files (a provider/forks-pool quirk); the `include` is correctly scoped to both layers and the ubuntu CI run is the authoritative report. `npm test` (non-coverage) is unaffected (200 pass).

Out-of-scope finding surfaced during install: **3 pre-existing transitive dev advisories** (esbuild GHSA-g7r4-m6w7-qqqr; form-data GHSA-hmw2-7cc7-3qxx; undici, several) — present in the lockfile before this change, dev-only, not in the app runtime deps. Candidate for a separate debt item, not fixed here.
