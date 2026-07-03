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
| AD-006 | 2026-07-03 | The **Workflows** epic (issue #56 PRD) is specified **milestone-by-milestone, WF1 first**. WF1 (headless-agent spike) is spec'd and will be executed before WF2–WF5 are spec'd. Also decided: ADO **child-task fetching** (net-new `$expand=Relations` gateway surface) is **in v1 scope** (lands in WF2). | The PRD itself calls WF1 a throwaway de-risk spike whose exact Claude Code flags are unverified; WF3/WF4 ACs depend entirely on what WF1 pins. Writing testable ACs for the agent step before the spike runs would fabricate outcomes. Child-task fetching doesn't exist today (`getWorkItems` is flat-fields only) but the "implement ticket" example (US 38) needs it. |
| AD-005 | 2026-06-28 | The PR gate runs on **windows-latest**, reversing AD-002. | First CI run (PR #57) failed: `worktree-manager.test.ts` asserts Windows backslash paths because the production code normalizes paths to backslashes — the app is Windows-only (only `--win` is ever built). The real-git suite is OS-coupled (`expected "/tmp/.../repo"` vs `received "\tmp\...\repo"`, plus `spawn git ENOENT`) and is green only on Windows. Making it OS-portable would be a large change to Windows-only code with no benefit. Matches release/nightly. |

## Handoff

**Status (current):** Workflows epic (issue #56) — **Execute** phase, WF1 only.
Planning complete: `spec.md` (WF1-01..08 — WF1-08 added a native `--json-schema`
arm N vs MCP arm M comparison), `design.md`, `tasks.md` (T1–T7, 3 phases → inline
execution). Per **AD-006**, only WF1 is spec'd; WF2–WF5 wait for the spike's pinned
flags. Branch **`feature/wf1-headless-agent-spike`** cut from `origin/main` (which
now carries the merged topbar PR #63).

**Execution plan (owner chose: cut branch + execute T1–T6; T7 owner-run):**
- Phase 1 (pure seams, parallel-safe): T1 `scrubAuthEnv`, T2 `emit-result-schema`,
  T3 `parseEnvelope`, T4 `buildAgentArgv` — all under `scripts/wf1-spike/*.ts`
  (+ `*.test.ts`), gated by `npm test` (glob already includes `scripts/**`).
- Phase 2: T5 `mcp-server.ts` (loopback HTTP MCP, adds `@modelcontextprotocol/sdk`
  devDep), gated `npm run typecheck && npm test`.
- Phase 3: T6 `run.ts` wiring (build gate), then **T7 empirical run + `findings.md`
  — owner-run against the live subscription** (WF1-D1; the milestone gate, not CI).

**Convention note:** `scripts/` is NOT in `tsconfig.node.json` include (matches the
existing `scripts/release-version.ts`), so spike `.ts` are covered by `npm test` +
`eslint .` (lint-clean), not `tsc`. No tsconfig change.

**Next step:** implement T1→T6 one atomic commit each (tlc Execute per-task cycle),
then dispatch the independent Verifier over the pure seams + MCP server. T7 handed
to the owner.

**Prior status:** Feature `worktree-existing-branch` (reuse/recreate an existing branch
on worktree create) **COMPLETE — PR [#62](https://github.com/obogoni/playground/pull/62)
open** on branch `feature/worktree-existing-branch`, awaiting review/merge. Design
resolved via grill-me; spec at `.specs/features/worktree-existing-branch/spec.md`.

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

**Next step:** address PR #62 review, then merge. The PR body carries **no**
`Closes #<n>` — this feature was not synced to a GitHub issue via `tlc-to-issues`
(no issue exists). Renderer UI (`BranchExistsChoice`) has no unit tests by
convention (AD-004) — visual/CDP hand-verify is owner-run.

**Merge note (unchanged):** `main` ruleset (`copilot_code_review`,
`non_fast_forward`, `deletion`); CI `gate` is not a required check; a force-push
BLOCKs the Copilot review → needs `gh pr merge --admin`.

**Open follow-ups (older, not in this feature):**
- 3 pre-existing transitive dev advisories (esbuild/form-data/undici) — candidate debt.
- App.tsx refactor remainder: `useTasks` / `useConfig` extraction (deferred, AD-004).
