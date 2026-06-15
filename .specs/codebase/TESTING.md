# Testing Infrastructure

**Last verified:** 2026-06-15 — `npx vitest run` ⇒ **125 tests / 11 files, all passing**.

## Test Frameworks

**Unit:** Vitest 4 (`vitest run`)
**Integration:** none (no integration framework; "integration-style" coverage is achieved with real OS temp dirs inside unit tests)
**E2E:** none automated. End-to-end behavior is checked by hand-run CDP smoke scripts (`scripts/smoke-*.mjs`) driving a live Electron app on `--remote-debugging-port=9222` against live Azure DevOps and real GUI tools. **Never run in CI.**
**Coverage:** no coverage tool configured (no `@vitest/coverage-*`, no coverage script).

## Test Organization

**Location:** Co-located — `*.test.ts` sits next to the module it tests (most tests live in `src/main/`; build-time helpers under `scripts/`).
**Naming:** `<module>.test.ts` (e.g. `task-board.test.ts` ↔ `task-board.ts`).
**Config:** `vitest.config.ts` → `include: ['src/**/*.test.ts', 'scripts/**/*.test.ts']` (the `scripts/` glob covers the build-time version helper).
**Structure:** `describe(<exported symbol>)` → `it(<behavior>)`, asserting observable behavior through the module's public surface.

## Testing Patterns

The governing principle: **extract pure/decision logic into a testable seam, unit-test that seam, and hand-verify the thin OS/Electron shell around it.** Three concrete patterns are in use — no mocking library is used anywhere (no `vi.mock`); fakes are hand-rolled and injected.

### 1. Pure-function tests (no setup)

Import the function, assert input→output. Used for parsing/string/command-building logic.
**Examples:** `parseVswhereProductPath`, `buildElevatedOpen` (`shortcut-launcher.test.ts`), `parseTaskInput` (`task-board.test.ts`), `tree.test.ts`.

### 2. Real-temp-dir tests (filesystem isolation)

`mkdtempSync(join(tmpdir(), 'wtm-…'))` in `beforeEach`, `rmSync(dir, { recursive: true, force: true })` in `afterEach`. Each test gets a unique directory — no shared state, no global mocks.
**Examples:** `config-store.test.ts`, `workspace-config.test.ts`, `workspace-registry.test.ts`, `worktree-manager.test.ts`, `repo-scanner.test.ts`.

### 3. Injected-fake / DI tests (no network, no Electron)

A hand-written stub implementing the collaborator's interface is passed into the constructor; the test records calls and asserts behavior. No network, no real Electron, no real `child_process`.
**Example:** `TaskBoard` driven by `stubSource` (a `WorkItemSource` fake) in `task-board.test.ts`.

> This third pattern is the model for the `UpdateService` in this feature: inject a fake `AutoUpdaterPort` + fake `Scheduler`, assert what `start()` does to them.

### What is deliberately NOT unit-tested

- **Renderer React components** (`src/renderer/**`) — verified via CDP smoke + a visual pass, by convention.
- **Thin OS/Electron shells** — the actual `child_process.spawn`/`execFile`, UAC elevation, and IPC wiring in `index.ts` are hand-verified; only the pure logic extracted out of them is unit-tested (see `ShortcutLauncher`: helpers tested, `spawn` path hand-run).
- **Build config / CI workflows** — verified by an actual build / real test release, not unit tests.

## Test Execution

**Commands:**
- Unit: `npm test` (alias for `vitest run`)
- Typecheck: `npm run typecheck` (`tsc --noEmit` for node + web projects)
- Lint: `npm run lint` (`eslint --cache .`)
- Build (Windows installer): `npm run build:win` (`typecheck` → `electron-vite build` → `electron-builder --win`)
- Manual smoke (per feature): `npm run dev -- -- --remote-debugging-port=9222`, then `node scripts/smoke-<feature>.mjs` (needs a live desktop session + seeded workspace; not for CI)

## Coverage Targets

**Current:** 125 tests / 11 files (no line-coverage metric collected).
**Goals:** Every main-process deep module and every extracted pure helper carries co-located unit tests. Renderer + thin shells are intentionally uncovered by unit tests.
**Enforcement:** The gate (`typecheck && lint && test`) is run locally per task and mirrored in CI by the release/nightly workflows; a red gate blocks publishing.

## Test Coverage Matrix

| Code Layer | Required Test Type | Location Pattern | Run Command |
| ---------- | ------------------ | ---------------- | ----------- |
| Main-process deep modules with logic (`ConfigStore`, `WorkspaceRegistry`, `workspaceBranchTemplate`, `WorktreeManager`, `RepoScanner`, `TaskBoard`, `buildTree`, **`UpdateService`**) | **unit** | `src/main/<module>.test.ts` | `npm test` |
| Extracted pure helpers (vswhere/command parsing, task parsing, **build version derivation**) | **unit** | co-located `*.test.ts` (`src/main/` or `scripts/`) | `npm test` |
| Thin OS/Electron shells (`child_process` spawn, UAC, `index.ts` IPC wiring + `UpdateService` construction) | none (hand-verified) | `src/main/index.ts`, shell methods | manual / `npm run typecheck` |
| Renderer React components (`src/renderer/**`) | none (CDP smoke + visual) | — | `node scripts/smoke-*.mjs` |
| Build config & CI workflows (`electron-builder.yml`, `.github/workflows/*`, `dev-app-update.yml`) | none (real build / real test release) | — | `npm run build:win` + cut a throwaway release |
| Out-of-CI smoke scripts (`scripts/smoke-*.mjs`) | manual only | `scripts/smoke-*.mjs` | `node scripts/smoke-*.mjs` (live session) |

## Parallelism Assessment

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --------- | -------------- | --------------- | -------- |
| Unit (pure) | **Yes** | No shared state; pure input→output | `shortcut-launcher.test.ts`, `tree.test.ts` |
| Unit (temp-dir) | **Yes** | Per-test unique `mkdtempSync` dir + `rmSync` teardown | `config-store.test.ts`, `workspace-config.test.ts` |
| Unit (injected fake) | **Yes** | Hand-rolled fakes constructed per test; no globals, no `vi.mock` | `task-board.test.ts` (`stubSource`) |
| CDP smoke | **No** | Single live app on a fixed debug port + shared ADO/disk state | `scripts/smoke-*.mjs` — run one at a time, by hand |

Vitest runs test files in parallel workers by default; all current unit tests are safe under that model. ⇒ Tasks whose only tests are unit tests may be marked `[P]`.

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| **Quick** | After a task whose only tests are unit tests | `npm test` |
| **Full** | Before opening a PR / after a logic-bearing task | `npm run typecheck && npm run lint && npm test` |
| **Build** | After build-config changes / phase completion | `npm run build:win` |
| **Manual** | User-facing or shell/CI behavior not unit-testable | `node scripts/smoke-<feature>.mjs` (live session) and/or cut a throwaway release |

> Every expected-pass count in `tasks.md` is anchored to the **125** baseline above; a task that adds N unit tests must end at `125 + N` with zero deletions.
