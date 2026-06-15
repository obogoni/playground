# Release CI/CD & Auto-Update Tasks

**Design**: `.specs/features/release-cicd-autoupdate/design.md`
**Spec**: `.specs/features/release-cicd-autoupdate/spec.md`
**Testing**: `.specs/codebase/TESTING.md` (baseline **105** tests / 9 files)
**Status**: Draft

---

## Execution Plan

### Phase 1 — Foundation (parallel)

```
T1 (deps + vitest include)   ┐
T2 (electron-builder.yml)    ┘   independent
```

### Phase 2 — Logic & config (parallel)

```
T1 ─┬─→ T3 (version helper + tests)
    └─→ T4 (UpdateService + tests)
T2 ───→ T7 (dev-app-update.yml)
```

### Phase 3 — Entry & wiring (parallel)

```
T3 ─→ T5 (stamp-version entry)
T4 ─→ T6 (index.ts wiring)
```

### Phase 4 — Workflows (parallel)

```
T2,T5 ─┬─→ T8 (release.yml)
       └─→ T9 (nightly.yml)
```

### Phase 5 — Verify (sequential)

```
T8,T9 ─→ T10 (manual end-to-end release check)
```

---

## Task Breakdown

### T1: Add `electron-updater` + `tsx`, broaden vitest include [P]

**What**: Add the runtime/dev deps and widen test discovery so later tasks have their toolchain.
**Where**: `package.json` (deps), `vitest.config.ts` (include)
**Depends on**: None
**Reuses**: existing dependency block / vitest config
**Requirement**: RLCD-05 (enables), RLCD-02 (enables)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `electron-updater` (^6) added to `dependencies`; `tsx` added to `devDependencies`; `npm install` clean
- [ ] `vitest.config.ts` `include` = `['src/**/*.test.ts', 'scripts/**/*.test.ts']`
- [ ] Gate check passes: `npm test`
- [ ] Test count: **105** tests still pass (no deletions)

**Tests**: none
**Gate**: quick
**Verify**: `npm ls electron-updater tsx` resolves; `npm test` → 105 passed
**Commit**: `build(release): add electron-updater + tsx, widen vitest include`

---

### T2: Rewrite `electron-builder.yml` to Windows-only on the GitHub feed [P]

**What**: Drop mac/linux targets and repoint publish to the public GitHub repo.
**Where**: `electron-builder.yml`
**Depends on**: None
**Reuses**: existing `win`/`nsis` blocks, `build/icon.ico`
**Requirement**: RLCD-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `mac`, `dmg`, `linux`, `appImage` blocks removed; `win` + `nsis` + `appId: com.playground` + `productName: Playground` kept
- [ ] `publish` = `{ provider: github, owner: obogoni, repo: playground }` (placeholder `generic`/example.com gone)
- [ ] An unpacked build succeeds and emits a stable `app-update.yml` naming the github provider + `latest` channel
- [ ] Gate check passes: `npm run build:win` (or `npx electron-builder --win --dir` for the config-only check)

**Tests**: none
**Gate**: build
**Verify**: inspect `dist/win-unpacked/resources/app-update.yml` → github provider, `latest`; no mac/linux artifacts produced
**Commit**: `build(release): windows-only electron-builder config on github feed`

---

### T3: Version-stamping helper + unit tests (TDD) [P]

**What**: Pure functions deriving the stable (from tag) and nightly (from run number) versions.
**Where**: `scripts/release-version.ts`, `scripts/release-version.test.ts`
**Depends on**: T1
**Reuses**: nothing (new pure logic); test style from `shortcut-launcher.test.ts` (pure input→output)
**Requirement**: RLCD-02, RLCD-09

**Tools**: MCP: NONE · Skill: `tdd`

**Done when**:
- [ ] `stableVersionFromTag('refs/tags/v1.2.3')` → `'1.2.3'`; throws on malformed refs (`refs/heads/main`, `v1.2`, empty)
- [ ] `nightlyVersion('0.1.0', 42)` → `'0.1.0-nightly.42'`; rejects non-positive/non-integer run numbers
- [ ] Gate check passes: `npm test`
- [ ] Test count: **105 + ≥6** new tests pass (no deletions)

**Tests**: unit
**Gate**: quick
**Verify**: `npm test` → 105 + new green; red-green-refactor history reflected
**Commit**: `feat(release): tag/run-number version-derivation helper`

---

### T4: `UpdateService` + `AutoUpdaterPort`/`Scheduler` + unit tests (TDD) [P]

**What**: The injectable update-policy module; all behavior asserted against a fake `autoUpdater` + fake clock.
**Where**: `src/main/update-service.ts`, `src/main/update-service.test.ts`
**Depends on**: T1
**Reuses**: DI/fake pattern from `task-board.test.ts` (`stubSource`)
**Requirement**: RLCD-05, RLCD-06, RLCD-08

**Tools**: MCP: NONE · Skill: `tdd`

**Done when**:
- [ ] Not packaged & no `forceDev` ⇒ `start()` touches the fake zero times (no field writes, no `on`, no `checkForUpdates`, no scheduler call) — RLCD-06
- [ ] Packaged ⇒ sets `autoDownload`/`autoInstallOnAppQuit` true, wires an `error` listener, triggers one initial `checkForUpdates`, and never assigns `channel` — RLCD-05
- [ ] Fake scheduler advanced by the interval ⇒ an additional `checkForUpdates` fires (and again on the next tick) — RLCD-08
- [ ] `forceDev: true` while not packaged ⇒ sets `forceDevUpdateConfig = true` and proceeds as packaged — RLCD-13
- [ ] Gate check passes: `npm test`
- [ ] Test count: **105 + ≥6** new tests pass (no deletions)

**Tests**: unit
**Gate**: quick
**Verify**: `npm test` → green; test imports neither real `electron-updater` nor `electron`
**Commit**: `feat(update): silent auto-update policy service (DI, dev-inert)`

---

### T5: `stamp-version.ts` CI entry [P]

**What**: Thin node entry that reads CI env, calls the T3 helper, and writes `package.json` version.
**Where**: `scripts/stamp-version.ts`
**Depends on**: T3
**Reuses**: `scripts/release-version.ts` (T3); `npm version --no-git-tag-version`
**Requirement**: RLCD-02, RLCD-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `--mode=stable` reads `GITHUB_REF`; `--mode=nightly` reads `GITHUB_RUN_NUMBER` + current `package.json` base version
- [ ] Writes the computed version via `npm version <v> --no-git-tag-version --allow-same-version`
- [ ] Supports `--dry-run` (prints, no write) for verification
- [ ] Gate check passes: `npm run typecheck`

**Tests**: none (derivation logic is unit-tested in T3; this is the IO shell — matrix layer = none)
**Gate**: full
**Verify**:
`GITHUB_REF=refs/tags/v9.9.9 npx tsx scripts/stamp-version.ts --mode=stable --dry-run` → prints `9.9.9`;
`GITHUB_RUN_NUMBER=7 npx tsx scripts/stamp-version.ts --mode=nightly --dry-run` → prints `<base>-nightly.7`
**Commit**: `build(release): package.json version-stamping entry`

---

### T6: Wire `UpdateService` into `index.ts` (+ per-channel AUMID) [P]

**What**: Construct and `start()` the service in `app.whenReady()`; make the app-user-model-id track the channel identity.
**Where**: `src/main/index.ts`
**Depends on**: T4
**Reuses**: existing `app.whenReady()` `handle(...)` wiring; `electronApp.setAppUserModelId`
**Requirement**: RLCD-07, RLCD-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] After the `handle(...)` block: `new UpdateService({ updater: autoUpdater, isPackaged: app.isPackaged, forceDev: process.env.PLAYGROUND_FORCE_UPDATE === '1' }).start()`
- [ ] Hard-coded `setAppUserModelId('com.playground')` now derives from the packaged identity so the nightly groups separately
- [ ] `electron-vite dev` run shows **zero** update activity (RLCD-06 in practice)
- [ ] Gate check passes: `npm run typecheck && npm run lint && npm test`
- [ ] Test count: prior total still passes (no deletions)

**Tests**: none (thin Electron glue — matrix layer = none)
**Gate**: full
**Verify**: `npm run dev` boots normally; no network calls to the update feed; no console update logs
**Commit**: `feat(update): start UpdateService on app ready; per-channel AUMID`

---

### T7: Add `dev-app-update.yml` [P]

**What**: Local-feed descriptor so a packaged-local build can exercise the real GitHub feed.
**Where**: `dev-app-update.yml` (repo root)
**Depends on**: T2
**Reuses**: publish identity from T2; already in `electron-builder.yml` `files` ignore list
**Requirement**: RLCD-13

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Contains `provider: github`, `owner: obogoni`, `repo: playground` (+ `channel`)
- [ ] Confirmed still excluded from packaged output (present in the `files` ignore glob)
- [ ] Gate check passes: `npm run typecheck` (no code change; sanity only)

**Tests**: none
**Gate**: quick
**Verify**: file parses as YAML; `electron-builder.yml:9` still ignores it
**Commit**: `build(update): dev-app-update.yml for local feed testing`

---

### T8: `release.yml` — tag-driven stable pipeline [P]

**What**: GitHub Actions workflow: gate → stamp → build → publish full release with auto notes.
**Where**: `.github/workflows/release.yml`
**Depends on**: T2, T5
**Reuses**: gate scripts; T5 stamping; electron-builder github publish (T2)
**Requirement**: RLCD-01, RLCD-03, RLCD-11, RLCD-12, RLCD-14

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Triggers on `push: tags: ['v*']`, `permissions: contents: write`, `runs-on: windows-latest`
- [ ] Steps in order: `npm ci` → `npm run typecheck && npm run lint && npm test` → `npx tsx scripts/stamp-version.ts --mode=stable` → `npx electron-builder --win --publish always` → GitHub Release with `generate_release_notes: true`
- [ ] Gate steps precede build so a red gate blocks publishing (RLCD-03)
- [ ] Commented `CSC_LINK`/`CSC_KEY_PASSWORD` env wired to secrets as the signing seam (RLCD-14)
- [ ] `actionlint`/YAML parse clean

**Tests**: none (CI config — verified by a real test tag in T10)
**Gate**: manual
**Verify**: `actionlint .github/workflows/release.yml` clean (or YAML lint); dry review of step order
**Commit**: `ci(release): tag-driven windows release + auto notes`

---

### T9: `nightly.yml` — dispatched side-by-side nightly [P]

**What**: Manually dispatched workflow building "Playground Nightly" on the `alpha` channel as a rolling single pre-release.
**Where**: `.github/workflows/nightly.yml`
**Depends on**: T2, T5
**Reuses**: gate scripts; T5 stamping (`--mode=nightly`); override matrix (design §5)
**Requirement**: RLCD-09, RLCD-10, RLCD-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Triggers on `workflow_dispatch`, `permissions: contents: write`, `runs-on: windows-latest`
- [ ] Same gate → `--mode=nightly` stamp → `npx electron-builder --win --publish always -c.appId=com.playground.nightly -c.productName="Playground Nightly" -c.publish.channel=alpha`
- [ ] Rolling single: deletes the prior `nightly` release/tag (`gh release delete nightly --cleanup-tag --yes || true`) then publishes a **pre-release** on the reused `nightly` tag with a one-line commit-stamped body
- [ ] YAML/`actionlint` clean

**Tests**: none (CI config — verified by dispatch in T10)
**Gate**: manual
**Verify**: `actionlint .github/workflows/nightly.yml` clean; override flags match design §5
**Commit**: `ci(release): dispatched alpha-channel nightly (rolling single)`

---

### T10: Manual end-to-end release verification

**What**: Prove the live loop that unit tests can't — install, auto-update, side-by-side nightly.
**Where**: (no repo file; uses `gh` + a throwaway tag)
**Depends on**: T8, T9
**Reuses**: published feeds from T8/T9
**Requirement**: RLCD success criteria (live round-trip per spec §Testing Notes)

**Tools**: MCP: NONE · Skill: NONE (uses `gh` CLI)

**Done when**:
- [ ] Push `v0.0.1` (throwaway) → release.yml produces an NSIS installer carrying `build/icon.ico` + `Playground`; install it
- [ ] Push `v0.0.2` → running stable app downloads silently and applies on next quit (version bumps after restart)
- [ ] Dispatch nightly → "Playground Nightly" installs alongside stable (separate shortcut + `%APPDATA%\Playground Nightly`); dispatch again → exactly one nightly pre-release remains
- [ ] Stable's update check never offers the nightly pre-release

**Tests**: manual
**Gate**: manual
**Verify**: documented in a short note appended to STATE.md / HANDOFF; clean up throwaway releases afterward
**Commit**: (none — verification only; record outcome in STATE.md)

---

## Parallel Execution Map

```
Phase 1:  [T1]  [T2]                         (foundation, independent)
Phase 2:  [T3] [T4] (after T1)   [T7] (after T2)
Phase 3:  [T5] (after T3)        [T6] (after T4)
Phase 4:  [T8] [T9] (after T2,T5)
Phase 5:  [T10] (after T8,T9)
```

`[P]` tasks in a phase touch disjoint files and share no mutable state; all unit tests are parallel-safe per TESTING.md.

---

## Pre-Approval Validation

### Check 1 — Task Granularity

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 2 cohesive config files (deps + vitest include) | ✅ Granular |
| T2 | 1 file (electron-builder.yml) | ✅ Granular |
| T3 | 1 helper + its test | ✅ Granular |
| T4 | 1 module + its test | ✅ Granular |
| T5 | 1 script entry | ✅ Granular |
| T6 | 1 file (index.ts) | ✅ Granular |
| T7 | 1 file (dev-app-update.yml) | ✅ Granular |
| T8 | 1 workflow | ✅ Granular |
| T9 | 1 workflow | ✅ Granular |
| T10 | 1 manual verification procedure | ✅ Granular |

### Check 2 — Diagram ↔ Definition Cross-Check

| Task | Depends On (body) | Diagram arrows in | Status |
| ---- | ----------------- | ----------------- | ------ |
| T1 | None | — | ✅ Match |
| T2 | None | — | ✅ Match |
| T3 | T1 | T1→T3 | ✅ Match |
| T4 | T1 | T1→T4 | ✅ Match |
| T5 | T3 | T3→T5 | ✅ Match |
| T6 | T4 | T4→T6 | ✅ Match |
| T7 | T2 | T2→T7 | ✅ Match |
| T8 | T2, T5 | T2→T8, T5→T8 | ✅ Match |
| T9 | T2, T5 | T2→T9, T5→T9 | ✅ Match |
| T10 | T8, T9 | T8→T10, T9→T10 | ✅ Match |

No `[P]` task depends on another `[P]` task in the same phase. ✅

### Check 3 — Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | deps/test config | none | none | ✅ OK |
| T2 | build config | none (build gate) | none | ✅ OK |
| T3 | extracted pure helper | **unit** | unit | ✅ OK |
| T4 | main-process deep module | **unit** | unit | ✅ OK |
| T5 | thin IO shell (logic lives in T3) | none | none | ✅ OK |
| T6 | thin Electron wiring | none | none | ✅ OK |
| T7 | build config | none | none | ✅ OK |
| T8 | CI workflow | none (real release) | none | ✅ OK |
| T9 | CI workflow | none (real release) | none | ✅ OK |
| T10 | manual verification | manual | manual | ✅ OK |

T5 is **not** test deferral: the version-derivation logic genuinely lives in T3's unit-tested helper; T5 is only env-read + file-write glue.

---

## Requirement Coverage

| Req | Task(s) |
| --- | ------- |
| RLCD-01 | T8 |
| RLCD-02 | T3, T5 |
| RLCD-03 | T8 (+ mirrored in T9) |
| RLCD-04 | T2 |
| RLCD-05 | T4 |
| RLCD-06 | T4, T6 |
| RLCD-07 | T6 |
| RLCD-08 | T4 |
| RLCD-09 | T3, T5, T9 |
| RLCD-10 | T6, T9 |
| RLCD-11 | T8, T9 |
| RLCD-12 | T8 |
| RLCD-13 | T4, T7 |
| RLCD-14 | T8, T9 |

**Coverage:** 14/14 requirements mapped to tasks. ✅
