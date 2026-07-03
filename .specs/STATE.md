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
| AD-007 | 2026-07-03 | The headless agent process is spawned **directly** — `shell:false`, argv array passed verbatim, child **stdin closed** (`stdio:['ignore','pipe','pipe']`). **NOT** via a shell, and **NOT** as a `.cmd` shim needing `shell:true` — this corrects the ".cmd shim" assumption in WF1's spec/design. Binds WF3's `agent-command-builder` / `agent-step-runner`. | WF1-T7 empirical finding (`claude` 2.1.199): the installed CLI is a native `.exe` (`~/.local/bin/claude.exe`). Under `shell:true` on Windows, cmd re-parses and corrupts inline JSON args (`--json-schema is not valid JSON: Unterminated string`), so `--json-schema`/`--mcp-config` must reach the exe **unquoted-by-a-shell**; a direct spawn keeps the argv intact and no config file is needed. Headless also blocks ~3s on stdin unless it is closed. Full evidence: `features/workflows-headless-agent-spike/findings.md`. |

## Handoff

**Status (current):** Workflows epic (issue #56) — WF1 **COMPLETE** (T1–T7,
including the owner-run empirical gate). Branch
**`feature/wf1-headless-agent-spike`** cut from `origin/main` (carries merged
topbar PR #63). Nothing pushed yet; no PR opened.

**T7 empirical gate PASSED** (`tsx scripts/wf1-spike/run.ts` vs `claude` 2.1.199,
live subscription, auth scrubbed): both arms + `--resume` ran end-to-end (42→142,
context carried); Arm M's forced `emit_result` hit the loopback HTTP MCP server;
`dontAsk` auto-denied a would-prompt action without hanging. **All WF1-01..08
confirmed** — see `findings.md`. Key confirmations: HTTP-MCP over loopback works
on 2.1.199 (the top risk); `session_id` field; `--json-schema`→`structured_output`;
`mcp__result__emit_result` allow-name works in headless; `--bare` refuted (unused).
**T7 code fix (226d903):** the installed `claude` is a native `.exe` not a `.cmd`
shim, so `shell:true` corrupted inline JSON — fixed to spawn directly (`shell:false`,
argv verbatim, stdin closed).

**T1–T6 committed (one atomic commit each) + independently verified (PASS):**
| Commit | Task | What |
| ------ | ---- | ---- |
| 3179cee | — | docs: spec + design + tasks |
| 632e8bc | T1 | `scrubAuthEnv` pure seam (WF1-01) |
| 39aae24 | T2 | `emit-result-schema` builder+validator (WF1-04) |
| 02dbc12 | T3 | `parseEnvelope` (WF1-05) |
| 3a20a49 | T4 | `buildAgentArgv` native+mcp arms (WF1-02/07/08) |
| 04bc480 | T5 | loopback HTTP MCP result server (+`@modelcontextprotocol/sdk` devDep) (WF1-03/04) |
| e89a4aa | T6 | `run.ts` throwaway orchestrator (no tests — external CLI boundary, AD-004) |

Independent Verifier (fresh sub-agent, author ≠ verifier): **PASS** — 8/8
automated ACs traced to `file:line`; gate green (typecheck 0 err, lint 0 warnings
in `scripts/wf1-spike/`, **257 tests pass**, spike subset 5 files / 32 tests);
discrimination sensor **5/5 mutants killed**. Report:
`.specs/features/workflows-headless-agent-spike/validation.md`. No gaps.

**Key implementation facts (feed WF2/WF3):**
- Two surviving pure seams (→ WF3): `scrub-auth-env.ts`, `emit-result-schema.ts`.
- MCP server uses the **low-level `Server` + `setRequestHandler`** (not `McpServer`)
  so `tools/list` returns `buildToolInputSchema(expect)` **verbatim**; `registerTool`
  reshapes it through Zod. Stateful per-token transport, `enableJsonResponse: true`,
  bearer token = auth **and** routing.
- SDK version `@modelcontextprotocol/sdk@^1.29.0`, installed with `--ignore-scripts`
  to skip the `electron-builder install-app-deps` native rebuild (node-gyp workaround).
- `scripts/` is NOT in `tsconfig.node.json` (matches `release-version.ts`) → spike
  `.ts` are covered by `npm test` + `eslint .`, not `tsc`.

**Findings recommendation for WF3:** both arms work; **default to Arm M (MCP)** to
keep the `blocked` terminal value + per-step routing/auth first-class (matches the
PRD), with Arm N (`--json-schema`) as a lighter `done`-only fast-path. Not superseded
— WF3 design decides. Two seams survive to WF3: `scrub-auth-env.ts`,
`emit-result-schema.ts`.

**Next step:** push `feature/wf1-headless-agent-spike` and open the PR. The PR must
**not** `Closes #56` (the epic stays open through WF5); consider `tlc-to-issues` to
create a per-milestone issue first. After WF1 lands, spec **WF2** (workflow-loader/
runner + ADO child-task `$expand=Relations` fetch, per AD-006).

**Prior features (merged, for context only):** `worktree-existing-branch` (PR #62)
and `topbar-version-indicator` (PR #63) are both merged into `main`.

**Merge note (unchanged):** `main` ruleset (`copilot_code_review`,
`non_fast_forward`, `deletion`); CI `gate` is not a required check; a force-push
BLOCKs the Copilot review → needs `gh pr merge --admin`.

**Open follow-ups (older, not in this feature):**
- 3 pre-existing transitive dev advisories (esbuild/form-data/undici) — candidate debt.
- App.tsx refactor remainder: `useTasks` / `useConfig` extraction (deferred, AD-004).
