# Project State

Project memory for the ADO Task & Worktree Manager. Decisions log (AD-NNN) +
Handoff snapshot.

## Decisions

| ID     | Date       | Decision | Rationale |
| ------ | ---------- | -------- | --------- |
| AD-001 | 2026-06-28 | A technical-debt remediation batch was opened from a repo audit. Five items registered as features and attacked in sequence: `ci-pr-gate` (#1) → `agent-form-stable-key` (#2) → `app-hooks-extraction` (#3) → `ado-fetch-timeout` (#9) → `coverage-reporting` (#12). | Audit found localized, actionable debt; sequencing front-loads the safety net (CI gate) before the behavioral fixes and refactor. |
| AD-002 | 2026-06-28 | ~~The PR quality gate (`ci-pr-gate`) runs on **ubuntu-latest**.~~ **REVERSED by AD-005.** | The gate only runs typecheck/lint/test; unit tests were assumed OS-independent. The assumption was wrong (see AD-005). |
| AD-003 | 2026-06-28 | Test coverage (`coverage-reporting`) is **report-only** — `@vitest/coverage-v8` + a `test:coverage` script, printed in CI, with **no failing threshold gate**. | Establish a baseline first; a blocking threshold can be layered on later once the real coverage numbers are known. |
| AD-004 | 2026-06-28 | The `App.tsx` god-component refactor (`app-hooks-extraction`) is **incremental** — extract `useSessions` + `useTree` now; `useTasks`/`useConfig` deferred. | Smaller, lower-risk PR; the renderer has no unit tests by convention, so the extracted hooks become the first testable seam. |
| AD-005 | 2026-06-28 | The PR gate runs on **windows-latest**, reversing AD-002. | First CI run (PR #57) failed: `worktree-manager.test.ts` asserts Windows backslash paths because the production code normalizes paths to backslashes — the app is Windows-only (only `--win` is ever built). The real-git suite is OS-coupled (`expected "/tmp/.../repo"` vs `received "\tmp\...\repo"`, plus `spawn git ENOENT`) and is green only on Windows. Making it OS-portable would be a large change to Windows-only code with no benefit. Matches release/nightly. |

## Handoff

**Status:** Feature `worktree-existing-branch` (reuse/recreate an existing branch
on worktree create) **COMPLETE on branch `feature/worktree-existing-branch`** —
not yet pushed / no PR. Design resolved via grill-me; spec at
`.specs/features/worktree-existing-branch/spec.md`.

Independent Verifier ran (fresh sub-agent, author ≠ verifier): **PASS** — 10/10
ACs traced to `file:line`, gate 67 passed / 0 failed (typecheck + lint 0 errors +
`worktree-manager.test.ts`), discrimination sensor 3/3 mutants killed. Report at
`.specs/features/worktree-existing-branch/validation.md`. One Verifier gap
(recreate re-invoke vs checked-out branch) closed with an added test post-report.

**Commits on the branch (4):**
| Commit | What |
| ------ | ---- |
| 8ba68c6 | docs(specs): spec |
| 106605e | feat: backend pre-flight detect + reuse/recreate modes + IPC (EXB-01..05, EXB-D8) |
| a558933 | feat: inline `<BranchExistsChoice>` in both create dialogs (EXB-06) |
| (latest) | test: recreate re-invoke vs checked-out branch (gap close) |

**Next step:** push branch + open PR. Per repo convention, put `Closes #<n>` in the
PR body — but this feature was **not** synced to a GitHub issue via `tlc-to-issues`
(no issue exists yet). Renderer UI (`BranchExistsChoice`) has no unit tests by
convention (AD-004) — visual/CDP hand-verify is owner-run.

**Merge note (unchanged):** `main` ruleset (`copilot_code_review`,
`non_fast_forward`, `deletion`); CI `gate` is not a required check; a force-push
BLOCKs the Copilot review → needs `gh pr merge --admin`.

**Open follow-ups (older, not in this feature):**
- 3 pre-existing transitive dev advisories (esbuild/form-data/undici) — candidate debt.
- App.tsx refactor remainder: `useTasks` / `useConfig` extraction (deferred, AD-004).
